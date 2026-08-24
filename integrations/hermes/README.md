# Hermes integration

Hermes Turn Router uses a versioned per-turn bridge between the Desktop composer and Gateway. The current integration patch targets Hermes commit:

```text
2584b7c4eca82ada05f16eba08936d157b483329
```

The installer refuses other commits and dirty source trees.

## Components

- `desktop/plugin.js` — compiled Desktop plugin
- `targets.example.json` — profile-scoped server target catalog
- `backend/turn_router/` — target authorization, approval tokens, protocol normalization, and SQLite ledger
- `patches/` — versioned Hermes core bridge
- `scripts/install.py` — preflight, backup, installation, verification, Desktop deployment, and rollback

## Install

Build the library and plugin:

```bash
npm ci
npm run check
```

Check compatibility without changing Hermes:

```bash
python integrations/hermes/scripts/install.py check \
  --hermes-source /path/to/hermes-agent \
  --hermes-home /path/to/hermes-home
```

Install the source bridge, target catalog, and Desktop plugin:

```bash
python integrations/hermes/scripts/install.py install \
  --hermes-source /path/to/hermes-agent \
  --hermes-home /path/to/hermes-home \
  --full-verify
```

For the Windows unpacked Desktop release, add `--deploy-desktop`. The installer builds Desktop, backs up `app.asar`, replaces its `dist` payload, and records the asar backup for rollback.

```bash
python integrations/hermes/scripts/install.py install \
  --hermes-source C:/path/to/hermes-agent \
  --hermes-home C:/path/to/hermes-home \
  --full-verify \
  --deploy-desktop
```

Restart Hermes after a source or packaged Desktop installation.

## Rollback

```bash
python integrations/hermes/scripts/install.py rollback \
  --hermes-home /path/to/hermes-home
```

Rollback restores every patched source file, the previous plugin and catalog, and `app.asar` when Desktop deployment was used. Backup archives remain under `<hermes-home>/turn-router/backups/`.

## Target catalog

The Gateway reads `<hermes-home>/turn-router/targets.json`. Client requests contain a target ID; provider, model, reasoning effort, cost class, cross-provider policy, and approval requirements stay server-side.

The default catalog contains `fast`, `balanced`, and `premium`. Edit it before restart to match the models available to the profile.

## Protocol

1. Desktop creates a stable `clientTurnId`.
2. Composer middleware attaches an optional `routingIntent` with a target ID.
3. Gateway computes a prompt digest and reserves the turn in SQLite.
4. Gateway resolves the target from the profile catalog.
5. Queue and retry paths retain the same envelope.
6. Direct turns move from `reserved` to `accepted` at the durable submit boundary. Busy queued turns stay `reserved` until `_run_prompt_submit` starts them.
7. Gateway emits `turn.accepted`; Desktop one-shot state consumes at that execution boundary.
8. Inline turns move to `completed` in the terminal `finally` path.
9. The previous model and reasoning runtime are restored after the turn.

Accepted rows survive Gateway restarts. Reuse of one turn ID with different prompt or routing content returns a conflict.

## Capability

The Desktop plugin calls:

```text
router.capabilities
```

Expected protocol:

```text
composer.turn-target.v1
```

If Desktop reports the socket as `open` before the live Gateway RPC object is attached, the plugin retries negotiation. If negotiation still fails at send time, the Router is bypassed visibly and the message continues with the current Hermes model. A Router failure never cancels the user's message.

## Verification

The patch includes Gateway and Desktop tests. Repository CI also runs the standalone protocol, catalog, ledger, installer, one-shot, capability, policy, CLI, and replay suites.

See [`../../docs/hermes-integration.md`](../../docs/hermes-integration.md) for the full matrix.
