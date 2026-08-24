import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

from integrations.hermes.backend.turn_router.ledger import TurnLedger


class LedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.path = Path(self.temp.name) / "state.db"
        self.clock = [1000.0]
        leases = iter([f"lease-{index}" for index in range(20)])
        self.ledger = TurnLedger(self.path, now=lambda: self.clock[0], new_lease=lambda: next(leases))
        self.scope = {"profile": "default", "lineage": "session-root", "turn_id": "turn-1"}

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def lease(result):
        return {"lease_id": result.lease_id, "envelope_hash": result.envelope_hash}

    def test_reserve_accept_complete_survives_restart(self):
        first = self.ledger.reserve(**self.scope, envelope_hash="hash-a")
        self.assertEqual(first.outcome, "reserved")
        self.assertTrue(self.ledger.accept(**self.scope, **self.lease(first)))
        self.assertTrue(self.ledger.accept(**self.scope, **self.lease(first)))
        self.assertTrue(self.ledger.complete(**self.scope, **self.lease(first)))
        self.assertTrue(self.ledger.complete(**self.scope, **self.lease(first)))
        restarted = TurnLedger(self.path, now=lambda: self.clock[0])
        duplicate = restarted.reserve(**self.scope, envelope_hash="hash-a")
        self.assertEqual(duplicate.outcome, "duplicate")
        self.assertEqual(duplicate.state, "completed")

    def test_same_id_with_different_envelope_is_conflict(self):
        self.ledger.reserve(**self.scope, envelope_hash="hash-a")
        result = self.ledger.reserve(**self.scope, envelope_hash="hash-b")
        self.assertEqual(result.outcome, "conflict")

    def test_scope_prevents_cross_session_turn_id_collisions(self):
        self.ledger.reserve(**self.scope, envelope_hash="hash-a")
        other = self.ledger.reserve(profile="default", lineage="other-session", turn_id="turn-1", envelope_hash="hash-b")
        self.assertEqual(other.outcome, "reserved")

    def test_release_only_removes_matching_pre_accept_lease(self):
        first = self.ledger.reserve(**self.scope, envelope_hash="hash-a")
        self.assertTrue(self.ledger.release(**self.scope, **self.lease(first)))
        self.assertIsNone(self.ledger.get(**self.scope))
        accepted = self.ledger.reserve(**self.scope, envelope_hash="hash-a")
        self.assertTrue(self.ledger.accept(**self.scope, **self.lease(accepted)))
        self.assertFalse(self.ledger.release(**self.scope, **self.lease(accepted)))
        self.assertEqual(self.ledger.get(**self.scope)["state"], "accepted")

    def test_stale_owner_cannot_mutate_reclaimed_lease(self):
        stale = self.ledger.reserve(**self.scope, envelope_hash="hash-a", reservation_ttl=10)
        self.clock[0] = 1011.0
        current = self.ledger.reserve(**self.scope, envelope_hash="hash-a", reservation_ttl=10)
        self.assertNotEqual(stale.lease_id, current.lease_id)
        self.assertFalse(self.ledger.release(**self.scope, **self.lease(stale)))
        self.assertFalse(self.ledger.accept(**self.scope, **self.lease(stale)))
        self.assertEqual(self.ledger.get(**self.scope)["lease_id"], current.lease_id)
        self.assertTrue(self.ledger.accept(**self.scope, **self.lease(current)))

    def test_expired_lease_cannot_transition(self):
        expired = self.ledger.reserve(**self.scope, envelope_hash="hash-a", reservation_ttl=10)
        self.clock[0] = 1011.0
        self.assertFalse(self.ledger.accept(**self.scope, **self.lease(expired)))
        self.assertFalse(self.ledger.complete(**self.scope, **self.lease(expired)))
        self.assertFalse(self.ledger.release(**self.scope, **self.lease(expired)))

    def test_expired_accepted_row_is_reusable(self):
        first = self.ledger.reserve(**self.scope, envelope_hash="hash-a")
        self.ledger.accept(**self.scope, **self.lease(first), retention_seconds=10)
        self.clock[0] = 1011.0
        replacement = self.ledger.reserve(**self.scope, envelope_hash="hash-a")
        self.assertEqual(replacement.outcome, "reserved")
        self.assertNotEqual(first.lease_id, replacement.lease_id)

    def test_existing_pre_lease_schema_is_migrated(self):
        legacy_path = Path(self.temp.name) / "legacy.db"
        with closing(sqlite3.connect(legacy_path)) as connection:
            connection.execute(
                "CREATE TABLE turn_router_ledger (profile TEXT, session_lineage TEXT, client_turn_id TEXT, "
                "envelope_hash TEXT, state TEXT, reserved_at INTEGER, accepted_at INTEGER, completed_at INTEGER, "
                "expires_at INTEGER, PRIMARY KEY(profile, session_lineage, client_turn_id))"
            )
            connection.execute(
                "INSERT INTO turn_router_ledger VALUES ('p','s','t','h','accepted',1,1,NULL,9999)"
            )
            connection.commit()
        migrated = TurnLedger(legacy_path)
        self.assertTrue(migrated.get(profile="p", lineage="s", turn_id="t")["lease_id"])


if __name__ == "__main__":
    unittest.main()
