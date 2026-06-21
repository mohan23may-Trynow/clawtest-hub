# Clawtest Hub

Test your OpenClaw agent against a battery of **local, sandboxed** checks — containment, API behavior, and prompt-injection resistance — without touching your real files or the cloud.

> **Status:** pre-build starter kit. The CLI is built phase by phase with Claude Code. See `START_HERE.md`.

## Why
A normal OpenClaw install runs agents **on the host with no sandbox by default**, and system-prompt guardrails are soft-only. Clawtest Hub verifies whether an agent is actually contained, behaves correctly against APIs, and resists prompt injection — before you trust it with real data.

## The three engines
1. **Containment / sandbox verification** — is the agent sandboxed, what's the tool policy, did it stay contained.
2. **Mock API server** — test success and `500`-error behavior without hitting the real web.
3. **Prompt-injection scanner** — feed adversarial payloads and assert the agent refused.

## How tests are defined
Plain YAML manifests (see `tests/lead_gen_test.yaml`). Run a manifest, get a pass/fail report + JSON.

## Layout
```
.
├── CLAUDE.md            # project memory for Claude Code
├── INTEGRATION_NOTES.md # verified OpenClaw integration facts (source of truth)
├── START_HERE.md        # first steps for the builder
├── tests/
│   ├── lead_gen_test.yaml
│   ├── mocks/dirty_leads.csv
│   └── payloads/injection_basic.md
└── .gitignore
```

## Local-first
No cloud, no servers, no data leaves your machine. Built for the OpenClaw "own your data" ethos.
