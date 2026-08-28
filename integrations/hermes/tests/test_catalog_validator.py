import json
import tempfile
import unittest
from pathlib import Path

from integrations.hermes.scripts.validate_catalog import validate_catalog
from integrations.hermes.backend.turn_router.catalog import CatalogError


class CatalogValidatorTests(unittest.TestCase):
    def test_reference_and_generic_catalogs_validate_without_exposing_models(self):
        for path in [
            "integrations/hermes/targets.example.json",
            "integrations/hermes/catalogs/same-provider.example.json",
            "integrations/hermes/catalogs/mixed-provider.example.json",
        ]:
            result = validate_catalog(path)
            self.assertTrue(result["ok"])
            self.assertGreater(len(result["targets"]), 0)
            self.assertIn("quality_rank", result["targets"][0])
            self.assertNotIn("provider", result["targets"][0])
            self.assertNotIn("model", result["targets"][0])

    def test_invalid_catalog_fails_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "targets.json"
            path.write_text(json.dumps({
                "schema_version": 1,
                "targets": [{"id": "bad target", "provider": "p", "model": "m"}],
            }), encoding="utf-8")
            with self.assertRaises(CatalogError):
                validate_catalog(path)


if __name__ == "__main__":
    unittest.main()
