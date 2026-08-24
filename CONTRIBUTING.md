# Contributing

1. Open an issue describing the routing failure with anonymized metadata: mode, intended tier, selected tier, reason codes, context-size bucket, and verification result. Do not post private prompts.
2. Add a failing behavior test before changing thresholds or patterns.
3. Keep provider/account-specific logic in presets or adapters, not the core.
4. Run `npm run check`.
5. For Hermes bridge changes, prove queue/retry idempotency and restoration on success/error/interrupt.

Use conventional commits: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `chore:`.

Threshold changes based on one anecdote are unlikely to merge. Prefer replay evidence across a representative, anonymized fixture set.
