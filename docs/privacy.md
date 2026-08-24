# Privacy

Hermes Turn Router's default policy is a local synchronous function. It does not call an LLM classifier or send a second copy of the prompt to a routing service.

## Default data flow

The policy receives the current text and optional metadata supplied by the host: attachment presence, current target, routing mode, an approximate context-size value, and an allowlist of target IDs. It returns a decision in memory.

## Recommended diagnostics

Store only:

- policy version;
- selected and actual target IDs;
- reason codes;
- context-size bucket;
- switch/cache-risk state;
- latency, provider-reported token usage, and verification outcome.

Do not store prompt text, attachment names or contents, file paths, credentials, tool arguments/output, or message history. Diagnostics must be opt-in if they leave the user's device.

## Provider boundary

Routing changes which configured provider may receive the user's message. The Gateway must resolve target IDs against a server-side allowlist. A client-reported target or reason code is not authorization.
