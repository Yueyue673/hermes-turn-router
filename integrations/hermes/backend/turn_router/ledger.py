from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import threading
import time
from contextlib import closing
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

LedgerStatus = Literal["reserved", "accepted", "completed"]


@dataclass(frozen=True)
class LedgerResult:
    outcome: Literal["reserved", "in_progress", "duplicate", "conflict"]
    state: LedgerStatus | None
    lease_id: str | None = None
    envelope_hash: str | None = None


class TurnLedger:
    """Durable idempotency ledger keyed by profile, lineage, and client turn ID."""

    def __init__(self, path: str | Path, *, now=time.time, new_lease=None):
        self.path = str(path)
        self._now = now
        self._new_lease = new_lease or (lambda: secrets.token_urlsafe(24))
        self._lock = threading.RLock()
        self._initialize()

    def _connect(self) -> sqlite3.Connection:
        connection = sqlite3.connect(self.path, timeout=5, isolation_level=None)
        connection.row_factory = sqlite3.Row
        connection.execute("PRAGMA busy_timeout=5000")
        # Reuse the journal mode chosen by Hermes (WAL or its filesystem-safe
        # DELETE fallback). A plugin must not override the profile DB policy.
        return connection

    def _initialize(self) -> None:
        Path(self.path).parent.mkdir(parents=True, exist_ok=True)
        with closing(self._connect()) as connection:
            connection.execute(
                """
                CREATE TABLE IF NOT EXISTS turn_router_ledger (
                    profile TEXT NOT NULL,
                    session_lineage TEXT NOT NULL,
                    client_turn_id TEXT NOT NULL,
                    envelope_hash TEXT NOT NULL,
                    lease_id TEXT NOT NULL,
                    state TEXT NOT NULL CHECK(state IN ('reserved','accepted','completed')),
                    reserved_at INTEGER NOT NULL,
                    accepted_at INTEGER,
                    completed_at INTEGER,
                    expires_at INTEGER NOT NULL,
                    PRIMARY KEY(profile, session_lineage, client_turn_id)
                )
                """
            )
            columns = {row[1] for row in connection.execute("PRAGMA table_info(turn_router_ledger)")}
            if "lease_id" not in columns:
                connection.execute("ALTER TABLE turn_router_ledger ADD COLUMN lease_id TEXT NOT NULL DEFAULT ''")
                connection.execute(
                    "UPDATE turn_router_ledger SET lease_id=lower(hex(randomblob(24))) WHERE lease_id=''"
                )
            connection.execute(
                "CREATE INDEX IF NOT EXISTS idx_turn_router_ledger_expiry ON turn_router_ledger(expires_at)"
            )

    @staticmethod
    def envelope_hash(value: dict[str, Any]) -> str:
        canonical = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
        return hashlib.sha256(canonical.encode("utf-8")).hexdigest()

    def reserve(
        self,
        *,
        profile: str,
        lineage: str,
        turn_id: str,
        envelope_hash: str,
        reservation_ttl: int = 300,
    ) -> LedgerResult:
        now = int(self._now())
        with self._lock, closing(self._connect()) as connection:
            connection.execute("BEGIN IMMEDIATE")
            connection.execute(
                "DELETE FROM turn_router_ledger WHERE rowid IN "
                "(SELECT rowid FROM turn_router_ledger WHERE expires_at < ? LIMIT 100)",
                (now,),
            )
            row = connection.execute(
                "SELECT envelope_hash, lease_id, state, expires_at FROM turn_router_ledger "
                "WHERE profile=? AND session_lineage=? AND client_turn_id=?",
                (profile, lineage, turn_id),
            ).fetchone()
            if row is None:
                lease_id = self._new_lease()
                connection.execute(
                    "INSERT INTO turn_router_ledger "
                    "(profile,session_lineage,client_turn_id,envelope_hash,lease_id,state,reserved_at,expires_at) "
                    "VALUES(?,?,?,?,?, 'reserved', ?, ?)",
                    (profile, lineage, turn_id, envelope_hash, lease_id, now, now + reservation_ttl),
                )
                connection.execute("COMMIT")
                return LedgerResult("reserved", "reserved", lease_id, envelope_hash)
            if row["envelope_hash"] != envelope_hash:
                connection.execute("COMMIT")
                return LedgerResult("conflict", row["state"], None, row["envelope_hash"])
            if row["state"] in ("accepted", "completed"):
                connection.execute("COMMIT")
                return LedgerResult("duplicate", row["state"], None, row["envelope_hash"])
            if int(row["expires_at"]) >= now:
                connection.execute("COMMIT")
                return LedgerResult("in_progress", "reserved", None, row["envelope_hash"])
            lease_id = self._new_lease()
            connection.execute(
                "UPDATE turn_router_ledger SET lease_id=?, reserved_at=?, expires_at=? "
                "WHERE profile=? AND session_lineage=? AND client_turn_id=?",
                (lease_id, now, now + reservation_ttl, profile, lineage, turn_id),
            )
            connection.execute("COMMIT")
            return LedgerResult("reserved", "reserved", lease_id, envelope_hash)

    def accept(
        self,
        *,
        profile: str,
        lineage: str,
        turn_id: str,
        lease_id: str,
        envelope_hash: str,
        retention_seconds: int = 604800,
    ) -> bool:
        now = int(self._now())
        with self._lock, closing(self._connect()) as connection:
            cursor = connection.execute(
                "UPDATE turn_router_ledger SET state='accepted', accepted_at=?, expires_at=? "
                "WHERE profile=? AND session_lineage=? AND client_turn_id=? AND state='reserved' "
                "AND lease_id=? AND envelope_hash=? AND expires_at>=?",
                (now, now + retention_seconds, profile, lineage, turn_id, lease_id, envelope_hash, now),
            )
            if cursor.rowcount:
                return True
            row = connection.execute(
                "SELECT state, lease_id, envelope_hash, expires_at FROM turn_router_ledger "
                "WHERE profile=? AND session_lineage=? AND client_turn_id=?",
                (profile, lineage, turn_id),
            ).fetchone()
            return bool(
                row
                and row["state"] in ("accepted", "completed")
                and row["lease_id"] == lease_id
                and row["envelope_hash"] == envelope_hash
                and int(row["expires_at"]) >= now
            )

    def complete(
        self,
        *,
        profile: str,
        lineage: str,
        turn_id: str,
        lease_id: str,
        envelope_hash: str,
        retention_seconds: int = 2592000,
    ) -> bool:
        now = int(self._now())
        with self._lock, closing(self._connect()) as connection:
            cursor = connection.execute(
                "UPDATE turn_router_ledger SET state='completed', completed_at=?, expires_at=? "
                "WHERE profile=? AND session_lineage=? AND client_turn_id=? AND state IN ('reserved','accepted') "
                "AND lease_id=? AND envelope_hash=? AND expires_at>=?",
                (now, now + retention_seconds, profile, lineage, turn_id, lease_id, envelope_hash, now),
            )
            if cursor.rowcount:
                return True
            row = connection.execute(
                "SELECT state, lease_id, envelope_hash, expires_at FROM turn_router_ledger "
                "WHERE profile=? AND session_lineage=? AND client_turn_id=?",
                (profile, lineage, turn_id),
            ).fetchone()
            return bool(
                row
                and row["state"] == "completed"
                and row["lease_id"] == lease_id
                and row["envelope_hash"] == envelope_hash
                and int(row["expires_at"]) >= now
            )

    def release(
        self,
        *,
        profile: str,
        lineage: str,
        turn_id: str,
        lease_id: str,
        envelope_hash: str,
    ) -> bool:
        now = int(self._now())
        with self._lock, closing(self._connect()) as connection:
            cursor = connection.execute(
                "DELETE FROM turn_router_ledger WHERE profile=? AND session_lineage=? "
                "AND client_turn_id=? AND state='reserved' AND lease_id=? AND envelope_hash=? AND expires_at>=?",
                (profile, lineage, turn_id, lease_id, envelope_hash, now),
            )
            return bool(cursor.rowcount)

    def cleanup(self, *, limit: int = 1000) -> int:
        with self._lock, closing(self._connect()) as connection:
            cursor = connection.execute(
                "DELETE FROM turn_router_ledger WHERE rowid IN "
                "(SELECT rowid FROM turn_router_ledger WHERE expires_at < ? LIMIT ?)",
                (int(self._now()), max(1, min(limit, 10000))),
            )
            return cursor.rowcount

    def get(self, *, profile: str, lineage: str, turn_id: str) -> dict[str, Any] | None:
        with closing(self._connect()) as connection:
            row = connection.execute(
                "SELECT * FROM turn_router_ledger WHERE profile=? AND session_lineage=? AND client_turn_id=?",
                (profile, lineage, turn_id),
            ).fetchone()
            return dict(row) if row else None
