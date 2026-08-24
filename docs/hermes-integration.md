# Hermes integration verification

A build is not enough. Verify the complete turn transaction.

## Gateway

- malformed envelopes fail closed;
- duplicate `clientTurnId` has no prompt, model, queue, or config side effects;
- failed pre-accept work releases the turn reservation so a retry can succeed;
- queued turns preserve the complete envelope;
- override is applied to the final agent after capability sync;
- model/provider/reasoning are restored on success, error, and interruption;
- compute-host path preserves `display_kind` and the envelope;
- no config file or persistent session override changes.

## Desktop

- fresh and existing sessions carry the same envelope contract;
- slow middleware cannot allow double-submit;
- session drift during routing does not redirect a turn;
- queue edits invalidate stale routing snapshots;
- retries retain the same turn ID;
- route failure stops the message instead of running the wrong model.

## Commands

Use the canonical commands for the Hermes revision you target. For the current development checkout:

```bash
pytest tests/tui_gateway/test_turn_model_routing.py tests/tui_gateway/test_account_subscription.py
cd apps/desktop
npm run typecheck
npx vitest run src/plugins/smart-router src/app/chat/composer src/sdk/composer-routing.test.ts
npm run build
```

Finally inspect the packaged `app.asar` and run one real fresh-session turn plus one existing-session turn.
