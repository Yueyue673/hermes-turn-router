# Security and privacy

Report vulnerabilities through [GitHub Security Advisories](https://github.com/Yueyue673/hermes-turn-router/security/advisories/new).

## Data flow

The policy engine and Desktop plugin run locally. They do not call a routing service. The Gateway receives the original Hermes prompt submission plus a target ID and short reason-code list.

The SQLite ledger stores:

- hashed profile scope
- session lineage identifier
- client turn ID
- envelope hash
- lifecycle timestamps and state

The envelope hash contains a prompt digest. Prompt text, attachment contents, credentials, and tool output are not stored in the ledger.

## Authorization

Provider, model, reasoning effort, cost class, cross-provider permission, and approval requirements are resolved from the profile target catalog. Client-supplied provider/model overrides are rejected.

Targets above the configured cost cap fail with `cost_cap_exceeded`. Cross-provider targets fail with `cross_provider_denied` when the catalog disables them.

Optional approval tokens use HMAC-SHA256. A token is bound to profile, session lineage, client turn ID, target ID, and expiry. Token lifetime is limited to ten minutes.

## Idempotency

Gateway reserves a turn before accepted side effects. Pre-accept failures release the reservation. Accepted and completed turns remain in SQLite and reject retries after process restart. Reuse of a turn ID with another prompt digest or target returns `turn_conflict`.

## Installation

The installer accepts one listed Hermes commit. It checks the patch SHA-256 digest, requires a clean source worktree, runs `git apply --check`, creates a ZIP backup, and records every modified layer. `--deploy-desktop` also backs up `app.asar`. Installation failures trigger rollback.

Review `targets.json` before restart. Each configured provider may receive message content routed to its target.
