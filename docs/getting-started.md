# Getting started

Hermes Turn Router has two usable surfaces:

1. the standalone policy engine and replay CLI;
2. the version-pinned Hermes Desktop/Gateway integration.

Start with the CLI if you only want to evaluate or customize routing policy. Install the Hermes bridge only after the CLI check passes.

## Requirements

| Component | Requirement |
|---|---|
| Policy engine | Node.js 20 or newer |
| Hermes installer | Python 3.11 or newer, Git, npm |
| Supported Hermes source | commit `2584b7c4eca82ada05f16eba08936d157b483329` |
| Packaged Desktop deployment | Windows unpacked release; close Hermes before deployment |

## 1. Clone and verify

```bash
git clone https://github.com/Yueyue673/hermes-turn-router.git
cd hermes-turn-router
npm ci
npm run check
```

A successful check runs TypeScript tests, Python integration tests, the production build, the compiled Desktop plugin smoke test, and CLI smoke tests.

## 2. Inspect one decision

```bash
node dist/cli.js route \
  --text "Review this production database migration carefully" \
  --allow fast,balanced,strong,premium \
  --context-tokens 24000 \
  --current-provider openai-codex \
  --current-model gpt-5.6-luna \
  --current-reasoning medium
```

The result contains the selected target, score, reason codes, switching state, context penalty, and cache risk.

## 3. Replay the fixture set

```bash
node dist/cli.js replay --input examples/replay.ndjson
```

Replay is the calibration loop. Add representative anonymized messages, set `expectedTierId`, and compare target distribution, switching rate, cache risk, and expected-target accuracy before changing production thresholds.

## 4. Prepare the Hermes catalog

The Gateway catalog is server authority. Copy the template to the target Hermes profile and edit it to match models actually available to that profile:

```text
<hermes-home>/turn-router/targets.json
```

Template:

```text
integrations/hermes/targets.example.json
```

The reference catalog uses:

| ID | Provider | Model | Effort |
|---|---|---|---|
| `fast` | `openai-codex` | `gpt-5.6-luna` | `medium` |
| `balanced` | `openai-codex` | `gpt-5.6-sol` | `medium` |
| `strong` | `openai-codex` | `gpt-5.6-sol` | `high` |
| `premium` | `openai-codex` | `gpt-5.6-sol` | `xhigh` |

## 5. Preflight the Hermes integration

Use native forward-slash paths on Windows:

```bash
python integrations/hermes/scripts/install.py check \
  --hermes-source C:/path/to/hermes-agent \
  --hermes-home C:/path/to/hermes-home
```

Preflight verifies:

- the exact supported Hermes commit;
- the integration patch SHA-256;
- a clean Hermes worktree;
- `git apply --check`;
- required build and runtime files.

Do not bypass a failed preflight. The patch is deliberately version-locked because Composer, Plugin SDK, Gateway, queue, and compute-host contracts move together.

## 6. Install

Source bridge, catalog, plugin, backup, and Gateway verification:

```bash
python integrations/hermes/scripts/install.py install \
  --hermes-source C:/path/to/hermes-agent \
  --hermes-home C:/path/to/hermes-home \
  --full-verify
```

For the Windows unpacked Desktop release, fully exit Hermes first, then add:

```bash
--deploy-desktop
```

The installer creates a ZIP backup before changing source/profile files. Packaged deployment also backs up `app.asar`, stages a replacement beside it, verifies hashes, and uses atomic replacement.

## 7. Restart and verify

After source or Desktop installation:

1. restart Hermes;
2. open the Router control beside the composer;
3. choose `auto`;
4. confirm the control displays a selected target after the next message;
5. inspect logs for `turn router applied` or `turn router target already active`.

If capability negotiation fails, version 0.2.2+ fails open: Hermes sends with the current native model and shows `Router bypassed` instead of swallowing the message.

## Roll back

```bash
python integrations/hermes/scripts/install.py rollback \
  --hermes-home C:/path/to/hermes-home
```

Rollback restores patched source, the previous Desktop plugin and catalog, Router-owned SQLite state when appropriate, and the previous `app.asar` when packaged deployment was used. Backup archives remain under:

```text
<hermes-home>/turn-router/backups/
```

## Next steps

- [Compatibility](compatibility.md)
- [Architecture](architecture.md)
- [CLI reference](cli.md)
- [Troubleshooting](troubleshooting.md)
- [Token and cache behavior](token-economics.md)
