#!/usr/bin/env python
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

_REPO_ROOT = Path(__file__).resolve().parents[3]
if str(_REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(_REPO_ROOT))

from integrations.hermes.backend.turn_router.catalog import CatalogError, TargetCatalog


def validate_catalog(path: str | Path) -> dict:
    catalog = TargetCatalog.load(path)
    capabilities = catalog.capabilities()
    return {
        "ok": True,
        "capability": capabilities["capability"],
        "protocol_version": capabilities["protocol_version"],
        "max_cost_class": capabilities["max_cost_class"],
        "allow_cross_provider": capabilities["allow_cross_provider"],
        "targets": [
            {
                "id": target["id"],
                "label": target["label"],
                "cost_class": target["cost_class"],
                "requires_approval": target["requires_approval"],
            }
            for target in capabilities["targets"]
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Validate a Hermes Turn Router Gateway target catalog")
    parser.add_argument("catalog", help="Path to targets.json")
    args = parser.parse_args()
    try:
        result = validate_catalog(args.catalog)
    except (CatalogError, json.JSONDecodeError, OSError) as exc:
        print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2), file=sys.stderr)
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
