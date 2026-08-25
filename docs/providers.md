# Providers and custom target catalogs

Hermes Turn Router has three separate configuration layers. Keeping them separate is the security boundary.

| Layer | File | Responsibility |
|---|---|---|
| Local policy | `RouterPolicy` JSON | score a turn and choose an opaque target ID |
| Gateway catalog | `targets.json` | authorize target ID → provider/model/effort/cost |
| Hermes provider | Hermes profile configuration | credentials, endpoint, model runtime and tool compatibility |

The policy engine and Gateway catalog are provider-agnostic. The prebuilt Desktop plugin distributed in releases embeds the tested Codex Luna/Sol policy. A custom provider requires a matching local policy and Gateway catalog, then a custom plugin build.

## Support language

- **Tested reference:** `openai-codex` with `gpt-5.6-luna` and `gpt-5.6-sol` effort tiers.
- **Structurally supported:** any provider/model token accepted by Hermes and the target catalog.
- **Verified support:** only after the provider completes prompt, tool, error, interrupt, queue/retry, restore and cache tests on the target profile.

A model name passing JSON validation does not prove agent-tool compatibility.

## Same-provider setup

Start from:

```text
integrations/hermes/catalogs/same-provider.example.json
```

Use one provider for all tiers and keep:

```json
{"allow_cross_provider": false}
```

This is the recommended first port because provider credentials, tool schemas and cache behavior remain in one runtime family.

Create a matching policy JSON with the same target IDs. Policy fields use camelCase:

```json
{
  "$schema": "../../policy.schema.json",
  "version": 1,
  "tiers": [
    {
      "id": "fast",
      "label": "Local fast",
      "provider": "your-provider",
      "model": "your-fast-model",
      "reasoningEffort": "low",
      "minScore": -100
    },
    {
      "id": "balanced",
      "label": "Cloud balanced",
      "provider": "your-provider",
      "model": "your-balanced-model",
      "reasoningEffort": "medium",
      "minScore": 25
    }
  ],
  "signals": [],
  "simpleRequestPatterns": [],
  "continuationPatterns": [],
  "modeBias": {"auto": 0, "save": -28, "quality": 25},
  "attachmentsWeight": 11,
  "mediumMessageChars": 180,
  "mediumMessageWeight": 16,
  "longMessageChars": 600,
  "longMessageWeight": 30,
  "safetyFloorTierId": "balanced",
  "switchUpMargin": 10,
  "switchDownMargin": 12,
  "contextTokenStep": 4000,
  "maxContextPenalty": 20,
  "largeContextStickyTokens": 32000
}
```

In production, copy the reference signal rules rather than leaving the arrays empty.

## Validate both files

Build the project, validate the local policy, then validate the server catalog with the same parser used by Gateway:

```bash
npm ci
npm run build
node dist/cli.js validate --policy C:/path/to/policy.json
python integrations/hermes/scripts/validate_catalog.py C:/path/to/targets.json
```

Catalog validation output intentionally omits provider/model values. The Desktop capability uses the same public projection.

The catalog schema is available at:

```text
integrations/hermes/target-catalog.schema.json
```

## Build a matching Desktop plugin

On macOS/Linux or Git Bash on Windows:

```bash
HERMES_TURN_ROUTER_POLICY=C:/path/to/policy.json npm run build
```

The build validates the policy and embeds it in:

```text
integrations/hermes/desktop/plugin.js
```

Run the canonical checks before deployment:

```bash
npm run check
```

The check suite also builds a temporary non-Codex policy, verifies that it is embedded, and restores the default release plugin.

Install the resulting plugin and the matching catalog through the version-pinned Hermes installer. Keep the policy and catalog target IDs identical.

## Cross-provider routing

A template is available at:

```text
integrations/hermes/catalogs/mixed-provider.example.json
```

Cross-provider routing requires:

```json
{"allow_cross_provider": true}
```

Treat this as an explicit server policy change. Verify each route for:

- provider credentials and account entitlement;
- tool-call schema and tool-result handling;
- reasoning-effort mapping;
- text, image and attachment support;
- context-window limits;
- prompt-cache behavior;
- interrupt and error cleanup;
- restoration of the base runtime;
- queue/retry idempotency;
- cost class and approval requirements.

Different providers do not normally share prompt caches. A cheap target can therefore be slower for a large established conversation.

## Approval and cost boundaries

Catalog controls remain server-side:

```json
{
  "max_cost_class": "standard",
  "allow_cross_provider": false,
  "targets": [
    {
      "id": "premium",
      "provider": "provider-b",
      "model": "expensive-model",
      "cost_class": "premium",
      "requires_approval": true
    }
  ]
}
```

Desktop cannot raise the cost ceiling, enable cross-provider routing, remove approval, or submit arbitrary provider/model overrides.

## Contributing a tested provider preset

A provider preset should include:

1. a policy JSON and Gateway catalog with aligned IDs;
2. anonymized replay fixtures;
3. provider/model/version and account-entitlement notes;
4. tool-call, error, interrupt and restore evidence;
5. long-context cache observations;
6. a compatibility entry that distinguishes tested from structural support.

Open a `provider` issue before submitting the preset so model slugs and support claims can be reviewed without exposing credentials.
