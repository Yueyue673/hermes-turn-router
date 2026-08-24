import hashlib
import os
import tempfile
import unittest
from pathlib import Path

from integrations.hermes.backend.turn_router.catalog import ApprovalTokenManager, TargetCatalog
from integrations.hermes.backend.turn_router.ledger import TurnLedger
from integrations.hermes.backend.turn_router.protocol import TurnCoordinator, TurnProtocolError


class ProtocolTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.catalog = TargetCatalog.from_dict({
            "schema_version": 1,
            "max_cost_class": "premium",
            "allow_cross_provider": True,
            "targets": [
                {"id": "fast", "label": "Fast", "provider": "p", "model": "m1", "cost_class": "low"},
                {"id": "premium", "label": "Premium", "provider": "p", "model": "m2", "cost_class": "premium", "requires_approval": True},
            ],
        })
        self.tokens = ApprovalTokenManager(os.urandom(32), now=lambda: 1000.0)
        self.coordinator = TurnCoordinator(
            catalog=self.catalog,
            ledger=TurnLedger(Path(self.temp.name) / "state.db", now=lambda: 1000.0),
            approval_tokens=self.tokens,
        )

    def tearDown(self):
        self.temp.cleanup()

    @staticmethod
    def digest(text):
        return hashlib.sha256(text.encode()).hexdigest()

    def intent(self, target="fast", token=None):
        routing = {"targetId": target, "mode": "auto", "reasonCodes": ["test"]}
        if token:
            routing["approvalToken"] = token
        return {"clientTurnId": "turn-1", "routingIntent": routing}

    def test_prepare_resolves_server_target_and_persists_acceptance(self):
        prepared = self.coordinator.prepare(
            self.intent(), profile="default", lineage="session", prompt_digest=self.digest("hello"), current_provider="p"
        )
        self.assertEqual(prepared.target.override_dict(), {"target_id": "fast", "provider": "p", "model": "m1"})
        self.assertEqual(prepared.ledger.outcome, "reserved")
        self.assertTrue(self.coordinator.accept(prepared))
        duplicate = self.coordinator.prepare(
            self.intent(), profile="default", lineage="session", prompt_digest=self.digest("hello"), current_provider="p"
        )
        self.assertEqual(duplicate.ledger.outcome, "duplicate")

    def test_prompt_change_with_same_turn_id_is_conflict_without_storing_prompt(self):
        self.coordinator.prepare(
            self.intent(), profile="default", lineage="session", prompt_digest=self.digest("one"), current_provider="p"
        )
        with self.assertRaises(TurnProtocolError) as error:
            self.coordinator.prepare(
                self.intent(), profile="default", lineage="session", prompt_digest=self.digest("two"), current_provider="p"
            )
        self.assertEqual(error.exception.code, "turn_conflict")

    def test_premium_requires_bound_approval_token(self):
        with self.assertRaises(TurnProtocolError) as error:
            self.coordinator.prepare(
                self.intent("premium"), profile="default", lineage="session", prompt_digest=self.digest("hello"), current_provider="p"
            )
        self.assertEqual(error.exception.code, "approval_required")
        token = self.tokens.issue(profile="default", lineage="session", turn_id="turn-1", target_id="premium")
        prepared = self.coordinator.prepare(
            self.intent("premium", token), profile="default", lineage="session", prompt_digest=self.digest("hello"), current_provider="p"
        )
        self.assertEqual(prepared.target.id, "premium")

    def test_plain_turn_without_routing_still_uses_durable_idempotency(self):
        prepared = self.coordinator.prepare(
            {"clientTurnId": "plain-turn"},
            profile="default",
            lineage="session",
            prompt_digest=self.digest("hello"),
            current_provider="p",
        )
        self.assertIsNone(prepared.target)
        self.assertTrue(self.coordinator.accept(prepared))

    def test_client_model_strings_are_ignored_and_target_id_is_required(self):
        with self.assertRaises(TurnProtocolError):
            self.coordinator.prepare(
                {"clientTurnId": "turn-1", "modelOverride": {"provider": "evil", "model": "expensive"}},
                profile="default", lineage="session", prompt_digest=self.digest("hello"), current_provider="p"
            )


if __name__ == "__main__":
    unittest.main()
