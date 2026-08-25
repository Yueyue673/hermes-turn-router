# Contributing

Contributions are welcome when they preserve Hermes turn, cache, authorization, and retry invariants.

## Start in the right place

- Reproducible bug: use the bug issue form.
- Under-route/over-route: use the routing policy miss form with an anonymized fixture.
- Provider/model support: use the provider preset form.
- Usage question: use [Q&A Discussions](https://github.com/Yueyue673/hermes-turn-router/discussions/categories/q-a).
- Design proposal: discuss it in [Ideas](https://github.com/Yueyue673/hermes-turn-router/discussions/categories/ideas) before adding integration surface.
- Security vulnerability: use a [private advisory](https://github.com/Yueyue673/hermes-turn-router/security/advisories/new).

Do not post credentials, OAuth tokens, private prompts, personal file paths, account IDs, profile databases, or unsanitized logs.

## Routing policy changes

1. Reduce the behavior to an anonymized replay event.
2. Add a failing behavior test before changing thresholds or patterns.
3. Run the reference evaluation and inspect category-level changes.
4. Update generated evidence in the same commit.
5. Explain why the new target is measurably more appropriate.

```bash
npm ci
npm run build
node dist/cli.js replay --input examples/reference-evaluation.ndjson
npm run evaluate:reference
npm run check
```

Threshold changes based on one anecdote are unlikely to merge. Prefer evidence across a representative fixture category.

## Provider presets

Keep provider/account-specific logic in policies, catalogs, or adapters—not the core router.

A provider contribution needs:

- matching policy and Gateway catalog target IDs;
- exact Hermes provider/model slugs;
- reasoning-effort and account-entitlement notes;
- text and tool-call evidence;
- success, error, interrupt, and runtime-restore evidence;
- queue/retry behavior;
- long-context/cache observations;
- an honest compatibility status.

Read [Providers and custom target catalogs](docs/providers.md).

## Hermes bridge changes

The bridge is version-pinned. Prove:

- capability negotiation and fail-open sends;
- server-authorized target resolution;
- queue/retry idempotency;
- reserved → accepted → completed transitions;
- one-shot consumption only after acceptance;
- runtime restoration after success, error, and interrupt;
- clean install and rollback against the supported Hermes commit;
- packaged Desktop deployment when affected.

Do not weaken the supported-commit or patch-hash checks to make a patch apply.

## Pull requests

Use conventional commits:

```text
feat: fix: refactor: docs: test: chore: ci:
```

Before opening a pull request:

```bash
npm run check
npm audit --omit=dev
npm pack --dry-run
```

The pull request should state:

- problem and root cause;
- behavior and security boundaries changed;
- tests and real execution evidence;
- compatibility impact;
- rollback or migration needs;
- explicit non-goals.

GitHub CI and CodeQL must pass. Generated evaluation artifacts must be current.
