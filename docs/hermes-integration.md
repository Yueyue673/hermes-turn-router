# Hermes integration verification

## Standalone repository

```bash
npm run check
```

This runs:

- TypeScript typecheck
- policy, replay, one-shot, capability, and adapter tests
- Python catalog, approval, ledger, protocol, runtime, and installer tests
- library and Desktop plugin builds
- CLI smoke tests

## Patched Hermes checkout

Gateway:

```bash
pytest tests/tui_gateway/test_turn_router_mature.py -q
```

Desktop:

```bash
cd apps/desktop
npm run typecheck
npx vitest run \
  src/sdk/composer-routing.test.ts \
  src/app/chat/composer/contrib.test.ts \
  src/app/chat/composer/hooks/use-composer-queue.test.tsx \
  src/app/chat/composer/hooks/use-composer-submit.test.tsx
npm run build
```

## Required behavior

### Capability and authorization

- `router.capabilities` reports `composer.turn-target.v1`
- capability payloads omit provider and model values
- unknown and disabled targets fail closed
- cost and cross-provider limits are enforced by Gateway
- client provider/model override strings are rejected
- approval tokens are bound and expire

### Idempotency

- ledger key includes profile scope, session lineage, and turn ID
- same ID and envelope is duplicate/in-progress
- same ID with another prompt digest or target is conflict
- reserved rows release on pre-accept failure
- accepted rows survive Gateway restart
- terminal inline turns become completed
- SQLite connections close on Windows

### Desktop

- fresh and existing sessions carry the same envelope
- slow middleware remains under the submit lock
- queued retries retain the turn ID and route intent
- editing queued text discards its stale envelope
- one-shot consumes after accepted submit response
- rejected submits leave one-shot armed
- capability and policy/catalog mismatch both bypass visibly and preserve the native Hermes send
- `off` mode uses normal Hermes model selection

### Runtime restoration

- target resolution occurs before the first model call
- transient selection is applied to the final agent after capability sync
- model, provider, and reasoning state restore on success, error, and interrupt
- no global config or persistent session model write occurs

## Installer

Run a fresh commit-pinned worktree through:

```bash
python integrations/hermes/scripts/install.py check ...
python integrations/hermes/scripts/install.py install ...
python integrations/hermes/scripts/install.py rollback ...
```

Verify the source is clean after rollback, newly created plugin/catalog files are removed, previous files are restored, and backup archives remain available.

For `--deploy-desktop`, verify the final `app.asar` hash matches the newly packed file and rollback restores the prior asar.

## End-to-end runtime

After restart:

1. confirm the external plugin is loaded;
2. send a fresh-session `fast` turn;
3. send an existing-session `premium` turn;
4. queue a second turn while the first is running;
5. restart Gateway and retry an accepted turn ID;
6. inspect `turn_router_ledger` for accepted/completed rows;
7. confirm the profile default model did not change.
