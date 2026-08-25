# Compatibility

Hermes Turn Router separates the portable policy engine from the version-sensitive Hermes bridge.

## Support matrix

| Surface | Status | Notes |
|---|---|---|
| TypeScript policy engine | Supported | Node.js 20+, Windows/macOS/Linux |
| CLI validate/route/replay | Supported | No Hermes installation required |
| Policy JSON Schema | Supported | Provider-agnostic target definitions |
| Hermes Agent source bridge | Version-pinned | Tested at commit `2584b7c4eca82ada05f16eba08936d157b483329` |
| Hermes Agent version | Tested | `0.20.5` at the supported commit |
| Windows unpacked Desktop deployment | Tested | Installer can build, back up, replace, and roll back `app.asar` |
| macOS/Linux packaged Desktop deployment | Not yet verified | Source patch can be inspected; packaged deployment path is Windows-specific |
| `openai-codex` reference catalog | Tested | `gpt-5.6-luna` and `gpt-5.6-sol` with effort tiers |
| Custom same-provider policy/catalog | Build path tested | Custom policy is validated and embedded at build time; each real provider/model still needs runtime evidence |
| Cross-provider catalogs | Structurally supported | Disabled by default in the reference catalog; requires explicit server policy and per-provider verification |
| Remote Hermes profiles | Protocol-compatible | Requires the same patched Gateway capability on the remote profile |

## Why the integration is version-pinned

The integration crosses several contracts that must change together:

- Desktop Composer draft and submit transaction;
- Plugin SDK turn envelope and reasoning state;
- Gateway JSON-RPC capability registration;
- server-authorized target catalog;
- queue, retry, and compute-host propagation;
- SQLite turn ledger;
- accepted/completed lifecycle events;
- packaged Desktop assets.

Applying an old patch to a new Hermes checkout can compile while breaking one of those runtime paths. The installer therefore checks both the Hermes commit and the patch SHA-256 before modification.

## Updating to a newer Hermes commit

Do not remove the commit check. Instead:

1. create a clean worktree at the new Hermes commit;
2. inspect upstream Composer, Plugin SDK, Gateway, queue, and compute-host changes;
3. port the narrow turn transaction contract;
4. run Gateway and Desktop test matrices;
5. rebuild the versioned patch and update its manifest hash;
6. test clean install, packaged deployment, and rollback.

See [`integrations/hermes/README.md`](../integrations/hermes/README.md) for the current patch manifest and commands.

## Version policy

- Policy/CLI behavior follows normal semantic versioning.
- A change to routing decisions, target thresholds, or public types is documented in `CHANGELOG.md`.
- Each Hermes integration patch names its supported upstream commit.
- A new supported Hermes commit should ship as a new patch/manifest entry, not by silently replacing the old compatibility claim.
