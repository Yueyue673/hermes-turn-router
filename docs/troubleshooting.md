# Troubleshooting

Start with the exact symptom. Router failures, Gateway failures, model-provider delays, and cache misses need different remedies.

## `Hermes gateway unavailable`

### What it means

This message is thrown by the Desktop Plugin SDK when the socket state is visible before the live Gateway RPC object is attached.

### Current behavior

Version 0.2.2+ retries capability negotiation. If retries still fail at send time, the Router fails open:

```text
Router bypassed: Hermes gateway unavailable
```

The message continues with the current Hermes model. Router unavailability must never make `off` the only way to send.

### Checks

- Restart Hermes after installing a new SDK/Gateway patch.
- Confirm `router.capabilities` is registered in the patched Gateway.
- Confirm `<hermes-home>/turn-router/targets.json` exists and parses.
- Run the installer preflight again.

## Router control shows `bypass`

Capability negotiation exhausted its bounded retries. Hover the control for the last error. Hermes still sends with its native model.

Common causes:

- Desktop restarted but Gateway patch was not installed;
- Gateway restarted against another Hermes profile;
- catalog missing or invalid;
- old Plugin SDK in the running `app.asar`;
- unsupported Hermes commit.

## `Router bypassed: no compatible targets`

Gateway responded, but no enabled and pre-authorized target ID intersects the policy embedded in the Desktop plugin. Targets above `max_cost_class` are not advertised. Approval-required targets are also excluded from the default control.

- Keep policy and catalog target IDs aligned.
- Build a matching plugin with `HERMES_TURN_ROUTER_POLICY=C:/path/to/policy.json npm run build`.
- Validate the catalog with `integrations/hermes/scripts/validate_catalog.py`.
- Do not rename only the Gateway targets while leaving the release Codex policy embedded.

The current message continues with Hermes' native model. An incompatible pending one-shot is disarmed so later auto turns do not enter a repeated bypass loop.

## A simple turn becomes unexpectedly slow

Check the model that actually served the turn, not only the base model selected in the composer.

Version 0.3.0 publishes transient `session.info`, so waiting UI names the serving model and effort. Gateway logs include:

```text
turn router applied
turn router target already active
```

For large sessions, inspect:

- input tokens;
- cached input tokens;
- selected target and effort;
- whether `large_context_sticky` appeared;
- whether the system prompt had to be rebuilt;
- provider transport errors.

A first request to a different model may need to process the full conversation prefix. In `auto`, established 32K+ contexts do not downgrade automatically for this reason.

## UI names one model but logs show another

Upgrade to 0.3.0+ and reinstall the Hermes bridge. Earlier transient routing did not publish serving-model state, so Desktop could display the restored base model while another model handled the turn.

## `target_unknown`

The Desktop requested a target ID that is absent or disabled in the Gateway catalog.

- Refresh/restart the profile after editing the catalog.
- Keep policy target IDs and catalog target IDs aligned.
- Do not put provider/model strings in the client request.

## `cross_provider_denied`

The selected target uses another provider while the catalog has:

```json
{"allow_cross_provider": false}
```

Either keep targets on the current provider or explicitly change the server policy. The client cannot override this restriction.

## `approval_required`

The target has `requires_approval: true` and no valid bound approval token was supplied. The default Desktop control hides approval-required targets because an interactive approval UI is not yet shipped.

## Installer reports an unsupported commit

The patch is version-pinned. Check out the supported Hermes commit or port the integration to the new upstream version. Do not force-apply the patch.

## Installer reports a dirty Hermes worktree

Commit, stash, or move local changes before installation. The installer needs a clean baseline so backup and rollback remain deterministic.

## `app.asar` replacement fails on Windows

Fully exit Hermes, including tray/background processes, then rerun `install --deploy-desktop`. The installer stages and verifies the new archive before atomic replacement; it will not overwrite a locked archive in-place.

## Rollback

```bash
python integrations/hermes/scripts/install.py rollback \
  --hermes-home C:/path/to/hermes-home
```

After rollback, restart Hermes. Keep backup archives until the restored app has completed a real send.

## Collecting a useful bug report

Include:

- Hermes commit and version;
- Router version;
- operating system;
- Router mode and selected target;
- redacted `targets.json` (no secrets);
- decision reason codes;
- relevant `turn router ...` log lines;
- whether the message reached `reserved`, `accepted`, or `completed`;
- whether the problem reproduces in a new session.

Do not include prompt text, credentials, OAuth tokens, API keys, or the full profile database.
