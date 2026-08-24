# Architecture

![Hermes Turn Router trust boundaries](../assets/architecture.svg)

```text
Desktop composer
  ├─ local policy → target id + reason codes
  ├─ stable clientTurnId
  └─ one-shot snapshot
           │
           ▼ same prompt.submit RPC
Gateway protocol
  ├─ capability/version check
  ├─ profile target catalog
  ├─ provider / model / reasoning / cost authorization
  ├─ prompt digest
  └─ SQLite reserve(profile, lineage, turn id, envelope hash)
           │
           ▼
reserved → accepted → completed
           │
           ├─ queue/retry keeps the same envelope
           ├─ exact target: no-op
           ├─ effort-only target: snapshot effort, no client rebuild
           ├─ different model: transient model switch
           ├─ model call and tools
           └─ runtime restore in finally
```

## Policy core

The TypeScript policy engine is synchronous. Inputs are the current message, mode, model state, context size, attachment presence, and allowed target IDs. Output is a `RouteDecision`.

The core has no React, Hermes RPC, credential, network, or filesystem dependency. Provider and model names live in policy data.

## Desktop plugin

The compiled external plugin contributes a composer control and middleware. It requests `router.capabilities`, intersects the local policy with Gateway target IDs, and attaches a `routingIntent` to the existing turn envelope.

The one-shot controller keeps its selection armed while a submit is pending. Direct accepted responses and the Gateway `turn.accepted` event consume the matching snapshot. Rejected or merely queued submits leave it armed.

Capability negotiation uses bounded retry because Desktop socket state can become `open` immediately before the live RPC object is attached. If negotiation still fails at send time, middleware returns the original draft and reports `Router bypassed`; Router failure never cancels the message.

Desktop passes provider, model, and live reasoning effort into the policy. Gateway publishes transient `session.info` after applying a target, so waiting UI names the model actually serving the turn, then publishes restored state after completion.

## Gateway target catalog

Each Hermes profile owns `<hermes-home>/turn-router/targets.json`. The client sends a target ID. Gateway resolves provider, model, reasoning effort, cost class, cross-provider policy, and optional approval requirements from this file.

Capability responses expose target labels and policy metadata. Provider/model values remain server-side.

## Durable turn ledger

`turn_router_ledger` is stored in the profile `state.db`. Its primary key is:

```text
profile scope + session lineage + client turn id
```

The envelope hash includes routing metadata and a server-computed prompt digest. The digest covers text and attachment file facts; prompt text is not stored in the ledger.

States:

- `reserved` — pre-accept work may still fail and release the row
- `accepted` — the message crossed a durable acceptance boundary
- `completed` — the turn reached a terminal success, error, or interrupt path

Accepted and completed rows reject retries after Gateway restart. Reusing a turn ID with different content or routing returns `turn_conflict`.

## Approval tokens

Targets may require approval. Tokens use HMAC-SHA256 and bind profile, lineage, turn ID, target ID, and expiry. The maximum token lifetime is ten minutes. Catalog installation can pre-authorize a target by leaving `requires_approval` disabled.

## Installation boundary

The Hermes bridge is commit-pinned. The installer checks the exact Hermes commit, patch checksum, clean worktree, and `git apply --check` before writing. It backs up source files, profile plugin/catalog files, and optionally `app.asar`; rollback restores each layer.

## Privacy

Routing and replay run locally. The ledger stores hashes and state metadata. Replay observations contain numeric usage, latency, verification, and re-answer fields. Prompt and tool content stay outside aggregate reports.
