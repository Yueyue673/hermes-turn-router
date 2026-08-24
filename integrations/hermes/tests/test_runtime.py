import json
import tempfile
import unittest
from pathlib import Path

from integrations.hermes.backend.turn_router.runtime import GatewayRouterRuntime, runtime_for_home


class RuntimeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.home = Path(self.temp.name)
        directory = self.home / "turn-router"
        directory.mkdir()
        self.catalog = directory / "targets.json"
        self.catalog.write_text(json.dumps({
            "schema_version": 1,
            "max_cost_class": "standard",
            "allow_cross_provider": False,
            "targets": [{
                "id": "fast", "label": "Fast", "provider": "p", "model": "m", "cost_class": "low"
            }],
        }), encoding="utf-8")

    def tearDown(self):
        self.temp.cleanup()

    def test_profile_scope_is_stable_and_lineage_prefers_root(self):
        first = GatewayRouterRuntime(self.home)
        second = GatewayRouterRuntime(self.home)
        self.assertEqual(first.profile_scope, second.profile_scope)
        self.assertEqual(
            first.lineage({"_lineage_root_id": "root", "session_key": "tip"}),
            "root",
        )

    def test_approval_key_survives_runtime_reconstruction(self):
        first = GatewayRouterRuntime(self.home)
        token = first.approvals.issue(
            profile=first.profile_scope,
            lineage="session",
            turn_id="turn-1",
            target_id="fast",
        )
        second = GatewayRouterRuntime(self.home)
        self.assertTrue(second.approvals.verify(
            token,
            profile=second.profile_scope,
            lineage="session",
            turn_id="turn-1",
            target_id="fast",
        ))
        self.assertGreaterEqual((self.home / "turn-router" / "approval.key").stat().st_size, 32)

    def test_runtime_cache_reloads_when_catalog_changes(self):
        first = runtime_for_home(self.home)
        data = json.loads(self.catalog.read_text(encoding="utf-8"))
        data["targets"][0]["label"] = "Fast updated"
        self.catalog.write_text(json.dumps(data), encoding="utf-8")
        second = runtime_for_home(self.home)
        self.assertEqual(second.capabilities()["targets"][0]["label"], "Fast updated")
        self.assertIsNot(first, second)


if __name__ == "__main__":
    unittest.main()
