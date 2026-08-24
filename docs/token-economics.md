# Token economics: when routing saves and when it backfires

The policy engine performs no LLM classifier call. It evaluates local metadata and regular expressions, so routing itself adds no model tokens.

The expensive part is **switching**:

- prompt caches are generally scoped to a provider/model/account;
- the first request after a switch may re-read the full conversation without the previous cache discount;
- switching back can repeat that cost;
- higher reasoning levels may spend substantially more hidden reasoning tokens;
- a weak first answer followed by a premium re-answer can cost more than routing premium immediately.

Therefore the optimization target is not “send every easy-looking sentence to the cheapest model.” It is:

> minimize model usage + cache re-reads + retries + correction time + failure risk.

## Implemented controls

- **Hysteresis:** an upgrade or downgrade must clear an additional margin.
- **Context penalty:** longer conversations raise the switching threshold.
- **Continuation affinity:** bare continuations keep the current model.
- **Safety floor:** save mode cannot downgrade high-impact operations below the configured tier.
- **Transparent risk:** each decision reports `switched`, `contextPenalty`, and `cacheRisk`.
- **No cloud classifier:** private text is not sent to a separate routing service.

## Metrics worth collecting

Collect only metadata unless users explicitly opt in:

- tier selected and final tier used;
- switch rate;
- re-answer/under-route rate;
- verification failures;
- latency and token usage supplied by the provider;
- approximate context size.

Do not collect prompt text, files, credentials, or tool output. “No feedback” is not proof of satisfaction.
