# Changelog

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
