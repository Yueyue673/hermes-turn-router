# CLI reference

Build first with `npm run build`, then run `node dist/cli.js`.

## `validate`

```bash
node dist/cli.js validate [--policy path/to/policy.json]
```

Compiles every regular expression and validates tier order, IDs, provider/model fields, and the safety-floor reference. Exits non-zero on invalid input.

## `route`

```bash
node dist/cli.js route --text "message" [options]
```

| Option | Meaning |
|---|---|
| `--policy FILE` | JSON policy; bundled preset when omitted |
| `--mode MODE` | `auto`, `save`, `quality`, `fixed`, or `off` |
| `--fixed ID` | Required target for fixed mode |
| `--once ID` | One-turn target override |
| `--allow A,B` | Server-verified target allowlist |
| `--context-tokens N` | Approximate current context size |
| `--current-provider SLUG` | Current provider for switch-cost calculation |
| `--current-model SLUG` | Current model |
| `--current-reasoning LEVEL` | Current reasoning effort |

Output is the complete `RouteDecision` as JSON. It never sends the message to a provider.

## `replay`

```bash
node dist/cli.js replay --input fixtures.ndjson [--policy policy.json]
```

One JSON object per line:

```json
{"text":"hello","mode":"auto","expectedTierId":"fast"}
```

Each line accepts the same fields as `RouteInput` except `policy`, plus optional `expectedTierId`. The summary contains counts only: target distribution, switches, cache risk, reasons, errors, and expectation accuracy. It does not echo fixture text.

Use replay to compare a policy change before and after editing thresholds. Keep private fixtures outside the repository.
