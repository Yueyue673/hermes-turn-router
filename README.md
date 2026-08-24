![Hermes Turn Router — per-turn, cache-aware, local model routing](assets/hero.svg)

# Hermes Turn Router

**A cache-aware, per-turn model router for Hermes Agent.**

[![CI](https://github.com/Yueyue673/hermes-turn-router/actions/workflows/ci.yml/badge.svg)](https://github.com/Yueyue673/hermes-turn-router/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-111111.svg)](LICENSE)
[![Node 20+](https://img.shields.io/badge/node-20%2B-111111.svg)](package.json)
[![Local routing](https://img.shields.io/badge/router-local-ff4d00.svg)](docs/privacy.md)

Route a greeting, a code change, and a production migration to different model targets—**without mutating the global Hermes model** and without paying for a second LLM just to classify the message.

> The useful question is not “what is the cheapest model for this sentence?” It is “which target minimizes model usage, cache re-reads, retries, correction time, and failure risk?”

[中文说明](README.zh-CN.md) · [Architecture](docs/architecture.md) · [Token economics](docs/token-economics.md) · [Privacy](docs/privacy.md)

## What it gives you today

Hermes Turn Router is more than a policy function. The repository ships three usable layers:

| Layer | Use it for | Status |
|---|---|---|
| **Policy engine** | Resolve an allowed target from text, mode, context size, and current model | Tested |
| **CLI + replay evaluator** | Validate policies, inspect one decision, and measure a fixture set before deployment | Tested |
| **Hermes integration contract** | Carry one immutable decision through queue, retry, compute-host, transient apply, and restore | Reference integration; upstream capability work required |

### Practical guarantees

- **No classifier tax** — local synchronous rules; no extra model call.
- **Cache-aware hysteresis** — long conversations require a clearer benefit before switching.
- **Safety floor** — save mode cannot push high-impact work below the configured minimum.
- **Server-authorized targets** — the policy selects only from a verified target allowlist.
- **Explainable output** — target, score, reason codes, raw tier, final tier, and cache risk.
- **Provider-agnostic core** — provider/model/reasoning are policy data, not hard-coded concepts.
- **Private by default** — replay output is aggregate-only and never echoes prompt text.

## Try it in two minutes

```bash
git clone https://github.com/Yueyue673/hermes-turn-router.git
cd hermes-turn-router
npm ci
npm run check
```

### 1. Validate a policy

```bash
node dist/cli.js validate --policy presets/codex-luna-sol.json
```

```json
{"ok":true,"version":1,"targets":["fast","balanced","premium"]}
```

### 2. Inspect one real routing decision

```bash
node dist/cli.js route   --text "Please carefully review this production migration architecture"   --allow fast,balanced,premium   --context-tokens 24000   --current-provider openai-codex   --current-model gpt-5.6-luna   --current-reasoning medium
```

The result includes the selected target and the cost of changing course:

```json
{
  "target": {"id":"premium","model":"gpt-5.6-sol","reasoningEffort":"xhigh"},
  "reasons": ["explicit_quality","high_impact","complex_reasoning"],
  "switched": true,
  "contextPenalty": 6,
  "cacheRisk": "medium"
}
```

### 3. Replay a fixture set before changing production policy

```bash
node dist/cli.js replay --input examples/replay.ndjson
```

The bundled fixture currently returns **6/6 expected decisions, one actual model switch, and zero errors**. Replay reports target distribution, switch rate, cache-risk buckets, reason-code counts, and expectation accuracy—without printing the original messages.

![Aggregate routing diagnostics shown as a local decision ledger](assets/decision-demo.svg)

## Why “simple message → cheap model” is not enough

Prompt caches are usually scoped to a provider/model/account. Switching a long session from A to B can force B to read the full history without A's cache discount; switching back may repeat that cost. Higher reasoning levels can also spend more hidden reasoning tokens.

Hermes Turn Router therefore applies:

1. a raw semantic score;
2. an explicit safety floor;
3. an upgrade/downgrade margin;
4. an additional context-size penalty;
5. continuation affinity for bare messages such as “continue.”

Explicit `quality`, `save`, `fixed`, and one-shot choices remain authoritative. Hysteresis protects `auto` mode from marginal ping-pong; it does not overrule the user. See [Token economics](docs/token-economics.md).

## Library API

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

`routeMessage()` is pure and synchronous. It performs no network request, stores no prompt, and writes no configuration.

## Model profiles, not product plans

The bundled `presets/codex-luna-sol.json` is a reference profile tested against our current Hermes setup. The core does **not** model ChatGPT Plus/Pro as universal routing concepts. A target is simply an ID with a provider, model, optional reasoning effort, and score threshold.

Create another profile for Anthropic, Gemini, DeepSeek, OpenRouter, LM Studio, or a mixed local/cloud stack. Validate it against [policy.schema.json](policy.schema.json), then replay representative fixtures before enabling it.

## Routing modes

| Mode | Behavior |
|---|---|
| `auto` | Balance task signals, impact, current target, and switch cost. |
| `save` | Prefer lower-cost targets while preserving the safety floor. |
| `quality` | Bias toward higher-capability allowed targets. |
| `fixed` | Bind new turns to one allowed target. |
| `off` | True bypass; retain normal Hermes behavior. |
| one-shot | Use one allowed target for the next **accepted** turn; not a persistent mode. |

## Hermes integration: honest status

> [!WARNING]
> This is an experimental community project, not an official Nous Research component. The policy engine and CLI are usable now; the public Desktop integration is a reference contract, not a blind one-click installer.

Current stable Hermes builds do not yet expose a negotiated public `composer.turn-model-override.v1` capability. A safe integration must add all of the following, not merely call `config.set` before sending:

- stable `clientTurnId` across queue and retry;
- prompt and immutable route intent in the same RPC;
- Gateway-side target resolution, provider/cost/reasoning allowlists, and approval policy;
- durable deduplication scoped by profile + session lineage + turn ID;
- transient apply/restore on success, error, and interrupt;
- explicit capability negotiation and incompatibility errors;
- zero persistent writes to `config.yaml` or the session model.

See the [integration contract](integrations/hermes/README.md) and [verification matrix](docs/hermes-integration.md). We deliberately do not publish an installer that overwrites moving Hermes core files and calls that compatibility.

## Project status

**0.1.0 proves the useful core:** configurable targets, local routing, cache-aware switching, allowlisted capabilities, CLI inspection, aggregate replay, tests, packaging, and an atomic Hermes contract.

Next work is operational rather than cosmetic:

- provider capability adapters;
- privacy-preserving usage ingestion;
- replay reports for under-route, over-route, latency, and real token usage;
- upstreamable Hermes capability negotiation and durable turn ledger;
- a packaged Desktop extension only after that boundary is stable.

See [Roadmap](docs/roadmap.md).

## Development

```bash
npm run check          # typecheck + 13 tests + build + CLI smoke tests
npm run render:assets  # rebuild PNG previews from editable SVG sources
npm pack --dry-run     # inspect the public package
```

Routing changes should start with a failing anonymized fixture or behavior test. Do not tune thresholds from one anecdote. Read [CONTRIBUTING.md](CONTRIBUTING.md) and [SECURITY.md](SECURITY.md).

## License

MIT. Hermes is a project/trademark of its respective owners. This repository is community-maintained and unaffiliated with Nous Research.
