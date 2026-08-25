# Changelog

## 0.4.1 - 2026-08-25

- Filtered targets above the Gateway `max_cost_class` out of capability responses while retaining server-side resolution checks.
- Intersected Gateway targets with the embedded Desktop policy and excluded disabled/approval-required targets before routing.
- Added `routeMessageSafely()` so invalid or empty policy/catalog combinations bypass visibly and preserve the native Hermes send.
- Disarmed an incompatible pending one-shot after policy mismatch to prevent repeated bypass loops.
- Added tests for capped capabilities, target intersection, unknown-only catalogs, and disallowed one-shot targets.
- Corrected the public `target_unknown` error code and fail-open integration documentation, then added documentation contract checks.
- Updated the versioned Hermes patch and installer checksum with the cost-cap capability behavior.

## 0.4.0 - 2026-08-25

### Routing and evaluation

- Fixed escaped whitespace/word-boundary expressions in the compiled TypeScript preset and added a regression test that keeps the JSON and compiled presets identical.
- Raised the attachment signal from 10 to 11 so a code message with an attachment reaches the balanced boundary.
- Added category-level replay summaries without echoing prompt text.
- Added a 32-event bilingual/stateful reference evaluation with generated Markdown and SVG evidence; 31 checked decisions match and the `off` event bypasses as intended.

### Provider portability

- Added a Gateway target-catalog JSON Schema, same-provider and mixed-provider templates, and a validator that uses the production catalog parser.
- Added validated custom-policy embedding for Desktop plugin builds through `HERMES_TURN_ROUTER_POLICY`.
- Changed `Best once` to choose the highest policy target allowed by Gateway instead of hard-coding `premium`.
- Added provider-porting, compatibility, approval, and cache verification guidance.

### Repository maintenance

- Added a deterministic animated routing demo generated from `routeMessage()` output.
- Added Dependabot, CodeQL, automated release tarballs/checksums, provider issue forms, and expanded contributor guidance.
- Enabled Discussions, dependency security updates, private vulnerability reporting, branch cleanup, and provider/policy/integration labels.

## 0.3.1 - 2026-08-24

- Rebuilt the README around a verified policy-engine path and a version-pinned Hermes installation path.
- Added a unified visual system with new Hero, trust-boundary architecture, real incident replay, and 1280×640 social preview assets.
- Added getting-started, compatibility, and troubleshooting guides.
- Added automated Markdown link, SVG parse, social-preview dimension, release-version, and target-ladder checks to CI.
- Updated repository description and topics to match the cache-stable, durable-ledger scope.
- Re-verified clean Hermes install/rollback and standalone tarball validate/replay flows.

## 0.3.0 - 2026-08-24

- Added a four-tier Codex policy: Luna Medium, Sol Medium, Sol High, and Sol XHigh.
- Added hard auto-mode affinity for established conversations above 32K context tokens.
- Passed the live Desktop reasoning effort into routing so hysteresis can identify the active target.
- Removed the redundant Desktop `fixed` mode; `off` plus Hermes' native model picker is the fixed-model workflow.
- Made explicit `save` and `quality` choices bypass auto-mode hysteresis.
- Avoided provider-client rebuilds for identical targets and effort-only changes.
- Published transient `session.info` so Desktop waiting copy names the model actually serving the turn.
- Added target/reason visibility to the Router control and server-side decision logs.

## 0.2.2 - 2026-08-24

- Retried the Desktop startup race where socket state was `open` before the live Gateway RPC object was attached.
- Refreshed routing capabilities again at send time when the initial target list is empty.
- Changed capability failure from cancelling the composer submission to a visible Router bypass, so messages always remain sendable.
- Added bounded-retry tests for transient and exhausted Gateway capability requests.

## 0.2.1 - 2026-08-24

- Kept busy queued turns in `reserved` state until execution starts, allowing crash recovery after TTL.
- Added `turn.accepted` events so queued one-shot selections consume at the execution boundary.
- Reused Hermes' profile SQLite journal mode instead of forcing WAL.
- Made accepted/completed transitions idempotent for the same active lease.

## 0.2.0 - 2026-08-24

- Added the `composer.turn-target.v1` capability handshake and server-side target catalog.
- Replaced client provider/model overrides with Gateway-authorized target IDs.
- Added a durable SQLite ledger scoped by profile, session lineage, and client turn ID.
- Added prompt-digest conflict detection, reserved/accepted/completed states, expiry, and restart-safe duplicate handling.
- Added HMAC approval tokens bound to profile, lineage, turn, target, and expiry.
- Changed one-shot routing to consume only after Gateway acceptance.
- Added observed token, cache, latency, verification, and re-answer metrics to replay summaries.
- Added a compiled external Desktop plugin and profile-scoped target catalog.
- Added a commit-pinned installer with checksum preflight, ZIP backup, verification, optional Desktop asar deployment, and rollback.
- Added Python Gateway/integration tests and expanded CI to Python 3.11.

## 0.1.0 - 2026-08-24

- Extracted a provider-agnostic routing core from a working Hermes Desktop implementation.
- Added configurable tiers, bilingual local signals, routing modes, safety floor, and one-shot overrides.
- Added a local CLI for policy validation and one-turn inspection.
- Added aggregate NDJSON replay with switch rate, cache-risk, reason, and expectation metrics.
- Added cache-aware switching hysteresis and explicit cache-risk reporting.
- Added editable SVG project visuals, a GitHub social preview, issue forms, and CI.
- Documented the atomic Hermes per-turn override contract, privacy model, and verification matrix.
