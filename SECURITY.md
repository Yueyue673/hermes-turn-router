# Security and privacy

Please report vulnerabilities privately through GitHub Security Advisories after the repository is published.

The default router is local and deterministic. It does not send prompts to a separate routing service and does not require credentials.

Integrations must:

- never log prompt text, file contents, credentials, or tool output;
- validate provider/model/reasoning tokens before invoking Hermes parsers;
- fail closed if an expensive or safety-critical override is malformed;
- keep per-turn overrides transient and restore runtime state in `finally`;
- preserve idempotency across queue and retry paths;
- never convert routing metadata into hidden prompt text.

A policy can influence where private content is sent. Users are responsible for limiting configured providers to destinations they trust.
