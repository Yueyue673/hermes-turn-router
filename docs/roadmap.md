# Roadmap

The roadmap separates shipped behavior from work that still lacks a verified implementation.

## Shipped

### 0.1 — policy and evaluation core

- configurable provider/model targets;
- local bilingual signals;
- routing modes and safety floors;
- cache-aware hysteresis;
- CLI validation and fixture replay;
- public schema, tests, and documentation.

### 0.2 — secure Hermes integration

- Gateway capability negotiation;
- server-authorized target catalog;
- durable SQLite turn ledger;
- prompt-digest conflict detection;
- accepted one-shot lifecycle;
- compiled Desktop plugin;
- versioned patch, install preflight, backup, Desktop deployment, and rollback;
- observed token, cache, latency, verification, and re-answer replay fields;
- bounded capability retry and fail-open sends.

### 0.3 — cache-stable four-tier routing

- Luna Medium, Sol Medium, Sol High, and Sol XHigh reference targets;
- current reasoning-effort propagation;
- large-context downgrade protection;
- exact-target no-op and effort-only runtime changes;
- serving-model status in Desktop;
- category-level reference evaluation;
- custom policy/catalog validation and Desktop plugin builds;
- deterministic animated routing demo;
- Dependabot, CodeQL, release asset checksums, and Discussions.

## Next verified milestones

### Additional Hermes compatibility

- port the bridge to newer Hermes commits without weakening fail-closed install checks;
- maintain one manifest and clean install/rollback result per supported commit;
- verify packaged Desktop deployment on macOS and Linux.

### Tested provider presets

- add same-provider presets only after text, tools, interrupt, restore, queue/retry, and cache tests;
- add cross-provider examples only with explicit cost/approval policy and cache-loss evidence;
- document account entitlement separately from model slug availability.

### Operational calibration

- import provider usage into anonymized replay observations;
- compare two policy runs and identify changed fixtures;
- report under-route, over-route, verification failure, re-answer, cache, and latency rates;
- add retention-controlled local decision logs that never store prompt text by default.

## Research track

These are experiments, not release promises:

- local classifier for ambiguous low-risk messages;
- provider capability discovery;
- account-entitlement adapters;
- opt-in policy learning from verified outcomes;
- interactive approval UX for `requires_approval` targets.
