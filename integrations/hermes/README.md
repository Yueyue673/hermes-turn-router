# Hermes integration

Hermes Smart Router needs a narrow **per-turn override bridge**. The router must not emulate a model picker by writing global configuration.

## Transaction contract

1. Desktop creates one stable `clientTurnId` before async middleware runs.
2. The policy returns an immutable target.
3. `{clientTurnId, modelOverride, routing}` travels in the same `session.create` or `prompt.submit` request as the prompt.
4. Gateway validates and deduplicates the envelope, applies the target immediately before the model call, and restores the previous runtime in `finally`.
5. Queue/retry paths preserve the same envelope and turn ID.
6. Temporary routing never writes `config.yaml`, never pins a session model, and never appends a fake user/system message.

`adapter.ts` converts a core decision into that envelope. `patches/hermes-core-bridge.patch` is a reference patch against the Hermes commit recorded in `patches/BASE_COMMIT`; inspect before applying to another version.

## Compatibility warning

Hermes internals move quickly. Do not apply the patch blindly after an update. Run `git apply --check`, review conflicts, then execute the test matrix in `docs/hermes-integration.md`.
