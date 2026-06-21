# CLAUDE.md — Clawtest Hub

> This file is read by Claude Code at the start of every session. It is the project's memory. Keep it accurate and concise.

## What we're building
**Clawtest Hub** — a **command-line tool** (`clawtest-hub`) that lets a developer test an OpenClaw agent safely, locally, before letting it loose on real files or APIs.

- **Language/stack:** TypeScript + Node.js. CLI only for the MVP.
- **NOT in the MVP:** no desktop GUI, no cloud, no marketplace. Those are v2.
- **The builder is non-technical.** Explain plans in plain language. Use **Plan Mode** before writing or running anything, and **ask before any destructive command** (deleting files, etc.).

## The three engines (the whole MVP = these + a YAML runner + a report)
1. **Containment / sandbox verification** — launch an OpenClaw agent, then verify its **safety posture**: is it sandboxed, what is the tool policy, and did it stay contained. Build *on* OpenClaw's own sandbox; do not reinvent it.
2. **Mock API server** — a local fake server the agent hits instead of the real web; can return success or forced `500` errors so we can test retry/looping behavior.
3. **Prompt-injection scanner** — feed adversarial payloads to the agent and assert it refused the unauthorized action.

Tests are defined in **YAML manifests** (see `tests/lead_gen_test.yaml`). Output is a clean pass/fail report + JSON, with basic profiling (runs, latency, tool-call success).

## Confirmed OpenClaw integration facts (source of truth: INTEGRATION_NOTES.md)
- **Gateway:** WebSocket, default `ws://127.0.0.1:18789`. **Port is configurable** — read it from config, don't hardcode.
- **Connecting requires an auth handshake:** first frame is a `connect` request; authenticate with the **gateway token** (in `~/.openclaw/openclaw.json` → `gateway.auth.token`); request scopes `operator.read` (to see results) and `operator.write` (to drive a session).
- **Workspace:** default `~/.openclaw/workspace` (configurable via `agents.defaults.workspace` / `OPENCLAW_WORKSPACE_DIR`). It is **NOT a hard sandbox** — absolute paths escape it.
- **Sandboxing is OFF by default.** When off, tools run on the host. This is the unsafe condition we exist to detect.
- **Three separate safety layers — assert on all three:**
  1. **Sandboxing** (`agents.defaults.sandbox`: `mode` off/non-main/all, `workspaceAccess` none/ro/rw, backend docker) = *where* tools run.
  2. **Tool policy** (`tools.allow`/`tools.deny`, `tools.sandbox.tools.*`) = *which* tools exist (hard stop).
  3. **Exec approvals** (`openclaw approvals`, elevated) = *whether* a host exec proceeds.
- **Inspection commands we can call:** `openclaw sandbox explain`, `openclaw approvals get`, `openclaw exec-policy show`, `openclaw config get <key>`.

## Hard rules
- **Never commit secrets.** The gateway token and any API keys must never be written into the repo. Use a local `.env` (already gitignored). Read the token from the user's `~/.openclaw/openclaw.json` or an env var at runtime.
- **Never run tests against the user's real `~/.openclaw/workspace`.** Always use a sandboxed / throwaway target. Add a guard that refuses to run otherwise.
- **Write a runnable test for every feature**, and tell the user the exact command to run it.
- **Commit to Git after each working step** so we can roll back.

## Build order (one phase per session)
- **Phase 1:** sandbox/containment verification (drive `agents.defaults.sandbox`; verify all three layers).
- **Phase 2:** YAML manifest runner + the gateway WebSocket auth handshake; first assert type `file_contains`.
- **Phase 3:** mock API server + `mock_api_called` assert + forced `500` test.
- **Phase 4:** injection scanner + `security_breach_detected` assert (see `tests/payloads/`).
- **Phase 5:** reporting, profiling, repeat-N-times consistency, `--help`.

## Pointers
- Source of truth for integration details: `INTEGRATION_NOTES.md`
- Sample test manifest: `tests/lead_gen_test.yaml`
- Sample fixture: `tests/mocks/dirty_leads.csv`
- Sample injection payload: `tests/payloads/injection_basic.md`
