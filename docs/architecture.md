# Architecture

```text
user turn
   │
   ▼
local feature extraction ── explicit mode / one-shot / safety
   │
   ▼
score → raw tier → safety floor
   │
   ▼
cache-aware hysteresis + session affinity
   │
   ▼
immutable RouteDecision
   │
   ▼
Hermes turn envelope (same RPC as prompt)
   │
   ▼
validate → dedupe → transient switch → model call → restore
```

## Boundaries

The core package is a pure, synchronous policy engine. It does not know about React, Hermes RPC, OAuth, account plans, or API keys. Provider/model names are data.

The Hermes adapter owns transport only. It must preserve turn identity and atomicity, but it must not classify text or persist a model selection.

Account entitlements belong in a preset resolver outside the core. A provider-specific plan such as ChatGPT Plus/Pro must never become a universal tier concept.

## Why rules first

Rules are cheap, inspectable, private, deterministic, and easy to replay. A learned classifier can be added later for ambiguous low-risk samples, but must be optional and measured against the no-classifier baseline.

## Non-goals for 0.1

- predicting exact provider billing from message text;
- silently changing fallback chains;
- storing conversation text for training;
- random exploration on high-impact actions;
- claiming that a model tier is universally “better.”
