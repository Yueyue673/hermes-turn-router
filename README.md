![Hermes Turn Router](assets/hero.svg)

# Hermes Turn Router

[![CI](https://github.com/Yueyue673/hermes-turn-router/actions/workflows/ci.yml/badge.svg)](https://github.com/Yueyue673/hermes-turn-router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-111111.svg)](package.json)

Per-turn model routing for Hermes Agent. Hermes Turn Router evaluates each message locally, selects an allowed model target, and keeps that decision stable across queue and retry paths.

[中文](README.zh-CN.md) · [CLI](docs/cli.md) · [Architecture](docs/architecture.md) · [Hermes integration](integrations/hermes/README.md)

## Highlights

- Local routing with no classifier request
- Configurable provider, model, reasoning effort, and score thresholds
- `auto`, `save`, `quality`, `fixed`, and one-shot routing modes
- Cache-aware hysteresis for long conversations
- Safety floors for high-impact operations
- Server-provided target allowlists
- JSON Schema validation for policy files
- CLI commands for validation, inspection, and fixture replay
- Aggregate replay reports that omit prompt text
- Immutable turn intent for Hermes queue and retry integration

## Quick start

```bash
git clone https://github.com/Yueyue673/hermes-turn-router.git
cd hermes-turn-router
npm ci
npm run check
```

`npm run check` runs the TypeScript typecheck, test suite, production build, and CLI smoke tests.

## CLI

### Validate a policy

```bash
node dist/cli.js validate --policy presets/codex-luna-sol.json
```

```json
{
  "ok": true,
  "version": 1,
  "targets": ["fast", "balanced", "premium"]
}
```

### Route one message

```bash
node dist/cli.js route   --text "Review this production migration carefully"   --allow fast,balanced,premium   --context-tokens 24000   --current-provider openai-codex   --current-model gpt-5.6-luna   --current-reasoning medium
```

```json
{
  "target": {
    "id": "premium",
    "provider": "openai-codex",
    "model": "gpt-5.6-sol",
    "reasoningEffort": "xhigh"
  },
  "reasons": ["explicit_quality", "high_impact", "complex_reasoning"],
  "switched": true,
  "contextPenalty": 6,
  "cacheRisk": "medium"
}
```

### Replay a fixture set

```bash
node dist/cli.js replay --input examples/replay.ndjson
```

Replay reports:

- target distribution
- switch count and switch rate
- cache-risk buckets
- routing reason counts
- expected-target accuracy
- validation and routing errors

The bundled fixture contains six cases and currently produces six expected decisions with zero errors.

![Routing decision ledger](assets/decision-demo.svg)

## Library

```ts
import { codexLunaSolPolicy, routeMessage } from 'hermes-turn-router'

const decision = routeMessage({
  text: 'Review this migration carefully',
  mode: 'auto',
  policy: codexLunaSolPolicy,
  allowedTargetIds: ['fast', 'balanced', 'premium'],
  estimatedContextTokens: 24_000,
  state: {
    currentProvider: 'openai-codex',
    currentModel: 'gpt-5.6-luna',
    currentReasoningEffort: 'medium'
  }
})
```

`routeMessage()` is synchronous and has no network or filesystem side effects.

## Routing model

A policy defines an ordered set of targets and a collection of weighted signals. The router computes a raw target, applies the configured safety floor, then evaluates the cost of moving away from the current target.

Longer contexts add a larger switching margin in `auto` mode. Explicit `save`, `quality`, `fixed`, and one-shot selections use their configured behavior directly.

The reference policy is stored in [`presets/codex-luna-sol.json`](presets/codex-luna-sol.json). The same schema supports cloud providers, local models, and mixed model pools.

```json
{
  "id": "balanced",
  "label": "Sol · Medium",
  "provider": "openai-codex",
  "model": "gpt-5.6-sol",
  "reasoningEffort": "medium",
  "minScore": 25
}
```

See [`policy.schema.json`](policy.schema.json) for the full format.

## Modes

| Mode | Behavior |
|---|---|
| `auto` | Applies signals, safety rules, session state, and switching cost. |
| `save` | Adds a lower-cost bias while retaining the safety floor. |
| `quality` | Adds a higher-capability bias. |
| `fixed` | Uses one allowed target for each new turn. |
| `off` | Leaves model selection to Hermes. |
| one-shot | Uses one allowed target for the next accepted turn. |

## Hermes integration

The policy engine and CLI run independently. Desktop routing additionally requires a per-turn execution bridge in Hermes:

1. Desktop assigns a stable `clientTurnId`.
2. The selected target is attached to the prompt submission.
3. Gateway resolves the target through its server-side catalog.
4. Queue and retry paths preserve the same decision.
5. Gateway applies the target for one turn and restores the previous runtime afterward.

The current integration contract and test matrix are documented in:

- [`integrations/hermes/README.md`](integrations/hermes/README.md)
- [`docs/hermes-integration.md`](docs/hermes-integration.md)

Hermes commit `2584b7c4ec` is supported through the versioned integration patch and installer. The installer checks the commit and patch checksum, creates a ZIP backup, runs Gateway tests, and can build/deploy the Windows unpacked Desktop release.

## Token and cache behavior

Prompt caches commonly depend on the provider, model, and account serving a request. A model switch can require the destination model to process the conversation prefix again. Hermes Turn Router includes the current context size in its switching threshold and reports cache risk on each decision.

Detailed behavior and suggested metrics are in [`docs/token-economics.md`](docs/token-economics.md).

## Development

```bash
npm run check
npm run render:assets
npm pack --dry-run
```

Routing changes should include a behavior test or an anonymized replay fixture. See [CONTRIBUTING.md](CONTRIBUTING.md).

## Project status

Version `0.2.0` adds Gateway-authorized targets, capability negotiation, a durable SQLite turn ledger, accepted one-shot semantics, observed usage metrics, a compiled Desktop plugin, and versioned install/rollback tooling for Hermes commit `2584b7c4ec`.

See [CHANGELOG.md](CHANGELOG.md) and [docs/roadmap.md](docs/roadmap.md).

## License

MIT. This is a community project and is not affiliated with Nous Research.
