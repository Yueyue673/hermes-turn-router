import importlib.util
import json
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

INSTALLER_PATH = Path(__file__).resolve().parents[1] / "scripts" / "install.py"
spec = importlib.util.spec_from_file_location("turn_router_installer", INSTALLER_PATH)
installer = importlib.util.module_from_spec(spec)
spec.loader.exec_module(installer)


class InstallerTests(unittest.TestCase):
    def test_patch_manifest_has_files_and_matching_checksum(self):
        manifest = installer.load_manifest()
        patch = installer.ROOT / manifest["patch"]
        self.assertEqual(installer.sha256(patch), manifest["patch_sha256"])
        self.assertGreaterEqual(len(installer.patch_paths(patch)), 20)

    def test_backup_and_restore_preserve_existing_and_remove_created_files(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source"
            home = root / "home"
            source.mkdir()
            existing = source / "existing.txt"
            existing.write_text("before", encoding="utf-8")
            plugin = home / "desktop-plugins" / "hermes-turn-router" / "plugin.js"
            plugin.parent.mkdir(parents=True)
            plugin.write_text("old plugin", encoding="utf-8")
            backup, record = installer.create_backup(source, home, ["existing.txt", "created.txt"])
            existing.write_text("after", encoding="utf-8")
            (source / "created.txt").write_text("created", encoding="utf-8")
            plugin.write_text("new plugin", encoding="utf-8")
            catalog = home / "turn-router" / "targets.json"
            catalog.parent.mkdir(parents=True, exist_ok=True)
            catalog.write_text("new catalog", encoding="utf-8")
            approval_key = home / "turn-router" / "approval.key"
            approval_key.write_bytes(b"x" * 32)
            with closing(__import__("sqlite3").connect(home / "state.db")) as connection:
                connection.execute("CREATE TABLE turn_router_ledger (id TEXT)")
                connection.commit()
            record_path = home / "turn-router" / "install-record.json"
            asar = root / "app.asar"
            asar_backup = root / "app.asar.bak"
            asar.write_text("new asar", encoding="utf-8")
            asar_backup.write_text("old asar", encoding="utf-8")
            record["asar_path"] = str(asar)
            record["asar_backup"] = str(asar_backup)
            record_path.write_text(json.dumps(record), encoding="utf-8")
            installer.restore_record(record)
            self.assertEqual(existing.read_text(encoding="utf-8"), "before")
            self.assertFalse((source / "created.txt").exists())
            self.assertEqual(plugin.read_text(encoding="utf-8"), "old plugin")
            self.assertFalse(catalog.exists())
            self.assertFalse(approval_key.exists())
            self.assertFalse(record_path.exists())
            self.assertEqual(asar.read_text(encoding="utf-8"), "old asar")
            with closing(__import__("sqlite3").connect(home / "state.db")) as connection:
                self.assertIsNone(connection.execute(
                    "SELECT 1 FROM sqlite_master WHERE type='table' AND name='turn_router_ledger'"
                ).fetchone())
            self.assertTrue(backup.exists())


if __name__ == "__main__":
    unittest.main()
