from __future__ import annotations

import hashlib
import os
import threading
from pathlib import Path

from .catalog import ApprovalTokenManager, CatalogError, TargetCatalog
from .ledger import TurnLedger
from .protocol import PreparedTurn, TurnCoordinator


class GatewayRouterRuntime:
    """Profile-scoped catalog, approval, and ledger lifetime for Hermes Gateway."""

    def __init__(self, hermes_home: str | Path):
        self.home = Path(hermes_home).resolve()
        self.catalog_path = self.home / "turn-router" / "targets.json"
        if not self.catalog_path.is_file():
            raise CatalogError("catalog_missing", "routing target catalog is not installed")
        self.catalog = TargetCatalog.load(self.catalog_path)
        self.ledger = TurnLedger(self.home / "state.db")
        self.approvals = ApprovalTokenManager(self._approval_secret())
        self.coordinator = TurnCoordinator(
            catalog=self.catalog,
            ledger=self.ledger,
            approval_tokens=self.approvals,
        )
        normalized_home = os.path.normcase(os.path.normpath(str(self.home)))
        self.profile_scope = hashlib.sha256(normalized_home.encode("utf-8")).hexdigest()[:24]

    def _approval_secret(self) -> bytes:
        key_path = self.home / "turn-router" / "approval.key"
        key_path.parent.mkdir(parents=True, exist_ok=True)
        try:
            descriptor = os.open(key_path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            secret = key_path.read_bytes()
        else:
            secret = os.urandom(32)
            with os.fdopen(descriptor, "wb") as stream:
                stream.write(secret)
            try:
                key_path.chmod(0o600)
            except OSError:
                pass
        if len(secret) < 32:
            raise ValueError("Hermes Turn Router approval key is invalid")
        return secret

    @staticmethod
    def lineage(session: dict, fallback_session_id: str = "") -> str:
        return str(
            session.get("_lineage_root_id")
            or session.get("stored_session_id")
            or session.get("session_key")
            or fallback_session_id
        )

    def capabilities(self) -> dict:
        return self.catalog.capabilities()

    def prepare(
        self,
        raw: dict,
        *,
        session: dict,
        prompt_digest: str,
        current_provider: str | None,
        fallback_session_id: str = "",
    ) -> PreparedTurn:
        return self.coordinator.prepare(
            raw,
            profile=self.profile_scope,
            lineage=self.lineage(session, fallback_session_id),
            prompt_digest=prompt_digest,
            current_provider=current_provider,
        )

    def accept(self, prepared: PreparedTurn, *, session: dict, fallback_session_id: str = "") -> bool:
        del session, fallback_session_id
        return self.coordinator.accept(prepared)

    def complete(self, prepared: PreparedTurn, *, session: dict, fallback_session_id: str = "") -> bool:
        del session, fallback_session_id
        return self.coordinator.complete(prepared)

    def release(self, prepared: PreparedTurn, *, session: dict, fallback_session_id: str = "") -> bool:
        del session, fallback_session_id
        return self.coordinator.release(prepared)


_runtime_lock = threading.RLock()
_runtimes: dict[str, tuple[int, GatewayRouterRuntime]] = {}


def runtime_for_home(hermes_home: str | Path) -> GatewayRouterRuntime:
    home = str(Path(hermes_home).resolve())
    catalog = Path(home) / "turn-router" / "targets.json"
    mtime = catalog.stat().st_mtime_ns
    with _runtime_lock:
        cached = _runtimes.get(home)
        if cached and cached[0] == mtime:
            return cached[1]
        runtime = GatewayRouterRuntime(home)
        _runtimes[home] = (mtime, runtime)
        return runtime
