#!/usr/bin/env python3
from __future__ import annotations

import argparse
import hashlib
import json
import shutil
import sqlite3
import subprocess
import sys
import tempfile
import time
import zipfile
from contextlib import closing
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MANIFEST_PATH = ROOT / "integration-manifest.json"


class InstallError(RuntimeError):
    pass


def run(command: list[str], *, cwd: Path, check: bool = True) -> subprocess.CompletedProcess:
    executable = shutil.which(command[0]) or (command[0] if Path(command[0]).is_file() else None)
    if not executable:
        raise InstallError(f"required executable was not found: {command[0]}")
    resolved = [executable, *command[1:]]
    if sys.platform == "win32" and Path(executable).suffix.lower() in {".cmd", ".bat"}:
        if Path(executable).stem.lower() not in {"npm", "npm.cmd"}:
            raise InstallError(f"Windows batch executable is not supported: {command[0]}")
        npm_cli = Path(executable).parent / "node_modules" / "npm" / "bin" / "npm-cli.js"
        node = Path(executable).parent / "node.exe"
        if not node.is_file():
            node_path = shutil.which("node")
            node = Path(node_path) if node_path else node
        if not node.is_file() or not npm_cli.is_file():
            raise InstallError("npm.cmd could not be resolved to node + npm-cli.js")
        resolved = [str(node), str(npm_cli), *command[1:]]
    try:
        result = subprocess.run(resolved, cwd=cwd, text=True, capture_output=True)
    except OSError as exc:
        raise InstallError(f"failed to start executable {command[0]}: {exc}") from exc
    if check and result.returncode:
        raise InstallError(
            f"command failed ({' '.join(command)}):" + chr(10) + (result.stderr or result.stdout)
        )
    return result


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))


def sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def patch_paths(patch_path: Path) -> list[str]:
    paths = []
    for line in patch_path.read_text(encoding="utf-8", errors="strict").splitlines():
        if line.startswith("diff --git a/"):
            right = line.split(" b/", 1)[1]
            if right not in paths:
                paths.append(right)
    if not paths:
        raise InstallError("patch contains no files")
    return paths


def ledger_exists(home: Path) -> bool:
    database = home / "state.db"
    if not database.is_file():
        return False
    with closing(sqlite3.connect(database)) as connection:
        row = connection.execute(
            "SELECT 1 FROM sqlite_master WHERE type='table' AND name='turn_router_ledger'"
        ).fetchone()
        return row is not None


def preflight(source: Path, home: Path, *, require_clean: bool = True) -> dict:
    manifest = load_manifest()
    patch = ROOT / manifest["patch"]
    if not source.joinpath(".git").exists() and run(["git", "rev-parse", "--git-dir"], cwd=source, check=False).returncode:
        raise InstallError(f"Hermes source is not a git checkout: {source}")
    head = run(["git", "rev-parse", "HEAD"], cwd=source).stdout.strip()
    if head not in manifest["supported_hermes_commits"]:
        raise InstallError(f"unsupported Hermes commit: {head}")
    if sha256(patch) != manifest["patch_sha256"]:
        raise InstallError("integration patch checksum does not match the manifest")
    if require_clean:
        dirty = run(["git", "status", "--porcelain"], cwd=source).stdout.strip()
        if dirty:
            raise InstallError("Hermes source has local changes; commit or stash them before installation")
    apply_check = run(["git", "apply", "--check", str(patch)], cwd=source, check=False)
    if apply_check.returncode:
        raise InstallError("patch preflight failed:" + chr(10) + (apply_check.stderr or apply_check.stdout))
    plugin = ROOT / manifest["plugin"]
    if not plugin.is_file():
        raise InstallError("built Desktop plugin is missing; run npm run build")
    node_check = run(["node", "--check", str(plugin)], cwd=ROOT, check=False)
    if node_check.returncode:
        raise InstallError("Desktop plugin syntax check failed:" + chr(10) + node_check.stderr)
    return {
        "ok": True,
        "source": str(source),
        "home": str(home),
        "hermes_commit": head,
        "capability": manifest["capability"],
        "patch_files": len(patch_paths(patch)),
    }


def create_backup(source: Path, home: Path, paths: list[str]) -> tuple[Path, dict]:
    backup_dir = home / "turn-router" / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    stamp = time.strftime("%Y%m%d-%H%M%S")
    backup = backup_dir / f"before-install-{stamp}.zip"
    external = {
        "plugin": home / "desktop-plugins" / "hermes-turn-router" / "plugin.js",
        "catalog": home / "turn-router" / "targets.json",
        "approval_key": home / "turn-router" / "approval.key",
    }
    record = {
        "source": str(source),
        "home": str(home),
        "backup": str(backup),
        "source_files": {path: (source / path).is_file() for path in paths},
        "external_files": {name: path.is_file() for name, path in external.items()},
        "ledger_preexisting": ledger_exists(home),
    }
    with zipfile.ZipFile(backup, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path, existed in record["source_files"].items():
            if existed:
                archive.write(source / path, f"source/{path}")
        for name, path in external.items():
            if path.is_file():
                archive.write(path, f"external/{name}")
        archive.writestr("record.json", json.dumps(record, indent=2))
    return backup, record


def restore_record(record: dict) -> None:
    source = Path(record["source"])
    home = Path(record["home"])
    backup = Path(record["backup"])
    if not backup.is_file():
        raise InstallError(f"backup does not exist: {backup}")
    external = {
        "plugin": home / "desktop-plugins" / "hermes-turn-router" / "plugin.js",
        "catalog": home / "turn-router" / "targets.json",
        "approval_key": home / "turn-router" / "approval.key",
    }
    with zipfile.ZipFile(backup) as archive:
        for path, existed in record["source_files"].items():
            destination = source / path
            if existed:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(f"source/{path}"))
            elif destination.exists():
                destination.unlink()
        for name, existed in record["external_files"].items():
            destination = external[name]
            if existed:
                destination.parent.mkdir(parents=True, exist_ok=True)
                destination.write_bytes(archive.read(f"external/{name}"))
            elif destination.exists():
                destination.unlink()
    asar_path = record.get("asar_path")
    asar_backup = record.get("asar_backup")
    if asar_path and asar_backup and Path(asar_backup).is_file():
        asar = Path(asar_path)
        backup_asar = Path(asar_backup)
        staged = asar.with_name(f"{asar.name}.turn-router.rollback")
        shutil.copy2(backup_asar, staged)
        if sha256(staged) != sha256(backup_asar):
            staged.unlink(missing_ok=True)
            raise InstallError("Desktop app.asar rollback staging verification failed")
        try:
            staged.replace(asar)
        except OSError as exc:
            staged.unlink(missing_ok=True)
            raise InstallError(f"Desktop app.asar atomic rollback failed: {exc}") from exc
    if not record.get("ledger_preexisting") and (home / "state.db").is_file():
        with closing(sqlite3.connect(home / "state.db")) as connection:
            connection.execute("DROP TABLE IF EXISTS turn_router_ledger")
            connection.execute("DROP INDEX IF EXISTS idx_turn_router_ledger_expiry")
    record_path = home / "turn-router" / "install-record.json"
    if record_path.exists():
        record_path.unlink()


def deploy_desktop_release(source: Path, home: Path, record: dict, record_path: Path) -> None:
    desktop = source / "apps" / "desktop"
    asar = desktop / "release" / "win-unpacked" / "resources" / "app.asar"
    if not asar.is_file():
        raise InstallError(f"packaged Desktop app.asar was not found: {asar}")
    run(["npm", "run", "build"], cwd=desktop)
    backup_dir = home / "turn-router" / "backups"
    backup_dir.mkdir(parents=True, exist_ok=True)
    asar_backup = backup_dir / f"app.asar-{time.strftime('%Y%m%d-%H%M%S')}.bak"
    shutil.copy2(asar, asar_backup)
    record["asar_path"] = str(asar)
    record["asar_backup"] = str(asar_backup)
    record_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    project_root = ROOT.parents[1]
    asar_cli = project_root / "node_modules" / "@electron" / "asar" / "bin" / "asar.js"
    if not asar_cli.is_file():
        raise InstallError("pinned @electron/asar CLI is missing; run npm ci")
    with tempfile.TemporaryDirectory(prefix="hermes-turn-router-asar-") as temporary:
        temporary_path = Path(temporary)
        extracted = temporary_path / "app"
        packed = temporary_path / "app.asar.new"
        run(["node", str(asar_cli), "extract", str(asar), str(extracted)], cwd=desktop)
        shutil.rmtree(extracted / "dist", ignore_errors=True)
        shutil.copytree(desktop / "dist", extracted / "dist")
        run(["node", str(asar_cli), "pack", str(extracted), str(packed)], cwd=desktop)
        if not packed.is_file() or packed.stat().st_size < 1024 * 1024:
            raise InstallError("new Desktop app.asar did not pass the size sanity check")
        staged = asar.with_name(f"{asar.name}.turn-router.new")
        shutil.copy2(packed, staged)
        if sha256(staged) != sha256(packed):
            raise InstallError("Desktop app.asar verification failed after replacement")
        try:
            staged.replace(asar)
        except OSError as exc:
            staged.unlink(missing_ok=True)
            raise InstallError(f"Desktop app.asar atomic replacement failed: {exc}") from exc


def install(source: Path, home: Path, *, full_verify: bool, deploy_desktop: bool) -> dict:
    status = preflight(source, home)
    manifest = load_manifest()
    patch = ROOT / manifest["patch"]
    paths = patch_paths(patch)
    backup, record = create_backup(source, home, paths)
    record_path = home / "turn-router" / "install-record.json"
    try:
        run(["git", "apply", str(patch)], cwd=source)
        plugin_target = home / "desktop-plugins" / "hermes-turn-router" / "plugin.js"
        plugin_target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(ROOT / manifest["plugin"], plugin_target)
        catalog_target = home / "turn-router" / "targets.json"
        catalog_target.parent.mkdir(parents=True, exist_ok=True)
        if not catalog_target.exists():
            shutil.copy2(ROOT / manifest["catalog_template"], catalog_target)
        record.update({
            "installed_at": int(time.time()),
            "integration_version": manifest["integration_version"],
            "patch_sha256": manifest["patch_sha256"],
        })
        record_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
        run([sys.executable, "-m", "pytest", "tests/tui_gateway/test_turn_router_mature.py", "-q"], cwd=source)
        if full_verify:
            run(["npm", "run", "typecheck"], cwd=source / "apps" / "desktop")
        if deploy_desktop:
            deploy_desktop_release(source, home, record, record_path)
            record_path.write_text(json.dumps(record, indent=2), encoding="utf-8")
    except Exception:
        restore_record(record)
        raise
    return {
        **status,
        "installed": True,
        "backup": str(backup),
        "plugin": str(plugin_target),
        "desktop_deployed": bool(record.get("asar_path")),
    }


def rollback(home: Path) -> dict:
    record_path = home / "turn-router" / "install-record.json"
    if not record_path.is_file():
        raise InstallError("no Hermes Turn Router install record was found")
    record = json.loads(record_path.read_text(encoding="utf-8"))
    restore_record(record)
    return {"rolled_back": True, "backup": record["backup"]}


def main() -> int:
    parser = argparse.ArgumentParser(description="Install the versioned Hermes Turn Router integration")
    parser.add_argument("action", choices=("check", "install", "rollback"))
    parser.add_argument("--hermes-source", type=Path)
    parser.add_argument("--hermes-home", type=Path, required=True)
    parser.add_argument("--full-verify", action="store_true")
    parser.add_argument("--deploy-desktop", action="store_true")
    args = parser.parse_args()
    try:
        if args.action == "rollback":
            result = rollback(args.hermes_home.resolve())
        else:
            if args.hermes_source is None:
                parser.error("--hermes-source is required for check/install")
            source = args.hermes_source.resolve()
            home = args.hermes_home.resolve()
            result = preflight(source, home) if args.action == "check" else install(
                source,
                home,
                full_verify=args.full_verify,
                deploy_desktop=args.deploy_desktop,
            )
        print(json.dumps(result, indent=2))
        return 0
    except Exception as error:
        print(json.dumps({"ok": False, "error": str(error)}, indent=2), file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
