import os
import unittest

from integrations.hermes.backend.turn_router.catalog import ApprovalTokenManager, CatalogError, TargetCatalog


def catalog(**overrides):
    data = {
        "schema_version": 1,
        "max_cost_class": "premium",
        "allow_cross_provider": True,
        "targets": [
            {"id": "fast", "label": "Fast", "quality_rank": 10, "provider": "p1", "model": "m1", "cost_class": "low"},
            {"id": "premium", "label": "Premium", "quality_rank": 40, "provider": "p2", "model": "m2", "reasoning_effort": "high", "cost_class": "premium", "requires_approval": True},
        ],
    }
    data.update(overrides)
    return TargetCatalog.from_dict(data)


class CatalogTests(unittest.TestCase):
    def test_capabilities_hide_provider_and_model(self):
        payload = catalog().capabilities()
        self.assertEqual(payload["capability"], "composer.turn-target.v1")
        self.assertNotIn("provider", payload["targets"][0])
        self.assertNotIn("model", payload["targets"][0])
        self.assertEqual(payload["targets"][0]["quality_rank"], 10)

    def test_cost_cross_provider_and_approval_are_server_authorized(self):
        limited = catalog(max_cost_class="standard")
        self.assertEqual([target["id"] for target in limited.capabilities()["targets"]], ["fast"])
        with self.assertRaisesRegex(CatalogError, "cost cap") as cost_error:
            limited.resolve("premium", current_provider="p2", approved=True)
        self.assertEqual(cost_error.exception.code, "cost_cap_exceeded")

        same_provider = catalog(allow_cross_provider=False)
        with self.assertRaises(CatalogError) as unknown_provider_error:
            same_provider.resolve("fast", current_provider=None)
        self.assertEqual(unknown_provider_error.exception.code, "current_provider_unavailable")
        with self.assertRaises(CatalogError) as provider_error:
            same_provider.resolve("premium", current_provider="p1", approved=True)
        self.assertEqual(provider_error.exception.code, "cross_provider_denied")

        with self.assertRaises(CatalogError) as approval_error:
            catalog().resolve("premium", current_provider="p2")
        self.assertEqual(approval_error.exception.code, "approval_required")
        self.assertEqual(catalog().resolve("premium", current_provider="p2", approved=True).override_dict()["model"], "m2")

    def test_catalog_rejects_string_booleans(self):
        with self.assertRaisesRegex(CatalogError, "must be a boolean"):
            TargetCatalog.from_dict({
                "schema_version": 1,
                "allow_cross_provider": "false",
                "targets": [{"id": "fast", "provider": "p", "model": "m", "enabled": "false"}],
            })

    def test_catalog_rejects_parser_shaped_provider_and_reasoning_values(self):
        with self.assertRaises(CatalogError):
            TargetCatalog.from_dict({
                "schema_version": 1,
                "targets": [{
                    "id": "bad", "provider": "p --base-url", "model": "m", "reasoning_effort": "extreme"
                }],
            })

    def test_catalog_rejects_invalid_or_duplicate_quality_ranks(self):
        for rank in (True, -1, 1_000_001, "40"):
            with self.subTest(rank=rank), self.assertRaises(CatalogError):
                TargetCatalog.from_dict({
                    "schema_version": 1,
                    "targets": [{"id": "fast", "provider": "p", "model": "m", "quality_rank": rank}],
                })
        with self.assertRaisesRegex(CatalogError, "duplicate quality_rank"):
            TargetCatalog.from_dict({
                "schema_version": 1,
                "targets": [
                    {"id": "fast", "provider": "p", "model": "m1", "quality_rank": 40},
                    {"id": "best", "provider": "p", "model": "m2", "quality_rank": 40},
                ],
            })

    def test_approval_tokens_are_bound_and_expire(self):
        clock = [1000.0]
        manager = ApprovalTokenManager(os.urandom(32), now=lambda: clock[0])
        token = manager.issue(profile="default", lineage="s1", turn_id="t1", target_id="premium", ttl_seconds=30)
        self.assertTrue(manager.verify(token, profile="default", lineage="s1", turn_id="t1", target_id="premium"))
        self.assertFalse(manager.verify(token, profile="default", lineage="s1", turn_id="other", target_id="premium"))
        clock[0] = 1031.0
        self.assertFalse(manager.verify(token, profile="default", lineage="s1", turn_id="t1", target_id="premium"))


if __name__ == "__main__":
    unittest.main()
