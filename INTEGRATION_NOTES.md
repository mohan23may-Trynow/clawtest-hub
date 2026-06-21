# INTEGRATION_NOTES.md
### Clawtest Hub — Source of Truth for the OpenClaw Integration Surface
*Verified against official OpenClaw docs + GitHub (docs.openclaw.ai, github.com/openclaw/openclaw), June 2026.*
*Sandbox/safety section re-verified June 2026 against docs.openclaw.ai/gateway/sandboxing + /security.*
*OpenClaw moves fast. Re-confirm against YOUR install before relying on any value below.*

---

## ✅ CONFIRMED VALUES (the two things the whole product depends on)

### 1. Gateway address / protocol
- **Default:** `ws://127.0.0.1:18789`
- **Protocol:** WebSocket. Text frames carrying JSON. The Gateway is the single control plane for sessions, channels, tools, and events.
- **Status:** CONFIRMED as the default — but **the port is configurable** (`gateway.port`, `--port`, or env). Do **not** hardcode it; read it from config at runtime.
- **There is also** an Admin HTTP RPC route (`POST /api/v1/admin/rpc`) that is **default-OFF**, for tooling that can't use WebSocket.

> ⚠️ **You cannot just open the socket.** Clients must complete an auth handshake:
> - First frame must be a `connect` request; client declares **role + scope** at handshake.
> - A **Gateway Token** is required, stored in `~/.openclaw/openclaw.json` under `gateway.auth.token`.
> - Scopes gate what you can do: you need `operator.read` to receive chat/agent/tool-result frames, and `operator.write` to send.
> - **Implication:** driving an agent from Clawtest Hub = WebSocket connect + token + correct scopes. Treat this as real work in Phase 2.

### 2. Agent workspace directory
- **Default:** `~/.openclaw/workspace`
- **Config key:** `agents.defaults.workspace` in `~/.openclaw/openclaw.json`
- **Env override:** `OPENCLAW_WORKSPACE_DIR` (an explicit config value takes precedence over the env var)
- **Profile variant:** if `OPENCLAW_PROFILE` ≠ `"default"`, the default becomes `~/.openclaw/workspace-<profile>`
- **State dir** (separate from workspace): default `~/.openclaw`, overridable via `OPENCLAW_STATE_DIR`. Holds `openclaw.json`, `credentials/`, `agents/<agentId>/sessions/`.
- **Status:** CONFIRMED as the default.

> 🚨 **CRITICAL DESIGN FINDING — the workspace is NOT a hard sandbox.**
> Tools resolve *relative* paths against the workspace, but **absolute paths can still reach anywhere on the host** unless OpenClaw's own sandboxing is enabled.
> **A "redirect the workspace path" approach does NOT protect the host machine.** This invalidates the naive Ghost Workspace design.

---

## 🧱 OpenClaw's safety model — UPDATED (re-verified against docs.openclaw.ai/gateway/sandboxing + /security)

### 🚨 #1 fact: SANDBOXING IS OFF BY DEFAULT
- A normal OpenClaw install does **NOT** sandbox. If sandbox mode is off, **tools run directly on the host** (agent can read/write/exec anywhere the user can).
- This is precisely the unsafe condition Clawtest Hub exists to detect. **Most installs in the wild are unsandboxed** — that's your market.
- Reminder: even when ON, OpenClaw's own docs say the sandbox is "not a perfect security boundary" — it limits blast radius, it doesn't eliminate it.

### The sandbox (when enabled via `agents.defaults.sandbox`)
- **`mode`:** `off` | `non-main` (sandbox everything except the main session — the recommended secure default) | `all`.
- **`workspaceAccess`** (default `none`):
  - `none` → tools see a fresh sandbox workspace under `~/.openclaw/sandboxes` (host workspace not mounted).
  - `ro` → agent workspace mounted **read-only** at `/agent` (disables write/edit/apply_patch).
  - `rw` → agent workspace mounted **read/write** at `/workspace`.
- **`scope`:** `session` | `agent` | `shared`.
- **`backend`:** `docker` (default), `openshell`, or `ssh`. Docker is the one you'll use.
- **Docker default image:** `openclaw-sandbox:bookworm-slim` — **note: no Node in the default image** (matters if a test fixture needs a runtime).
- **Network:** containers default to **no network**; override with `sandbox.docker.network`. `host` is blocked.
- **`docker.binds`** can mount host dirs into the container (`host:container:mode`) — these *pierce* the sandbox, so they're a thing your tool should flag if mis-set.

### 🔑 #2 fact: there are THREE separate safety layers — assert on ALL of them
Clawtest Hub's real value is verifying this whole posture, not just file writes:
1. **Sandboxing** = *where* tools run (isolation / blast radius).
2. **Tool policy** (`tools.allow`/`tools.deny`, `tools.sandbox.tools.*`) = *which* tools exist. This is the hard stop — `/exec` can't override a denied tool.
3. **Exec approvals** (`openclaw approvals`, elevated mode) = *whether* a host exec command may proceed. Effective policy = the **stricter** of config and host-local approvals.

> **Prompt injection ties it together (your wedge):** OpenClaw's own security docs say system-prompt guardrails are *soft guidance only*; hard enforcement comes from tool policy + exec approvals + sandboxing + channel allowlists. So your injection scanner tests whether the soft guardrails hold, and your sandbox/policy asserts test whether the hard boundaries are actually configured to contain a successful injection.

### Inspection commands your tool can call to verify posture (free wins)
- `openclaw sandbox explain` → effective sandbox mode, scope, backend, workspace access.
- `openclaw approvals get` / `openclaw exec-policy show` → approval + exec policy state.

**→ Revised Phase 1 strategy:** Clawtest Hub configures/launches an agent, runs it, then **verifies all three layers** — is it sandboxed, is the tool policy what was expected, did it stay inside the sandbox? Don't intercept file paths from outside (absolute paths escape, and unsandboxed agents bypass it entirely). Your value is the **assert + injection-scanner + reporting layer on top of OpenClaw's own controls.**

---

## 🔧 Commands to confirm these on YOUR machine (do this first)

Run on the machine where the Gateway runs (that's where the workspace lives):

```bash
# Confirm the gateway is up and reachable (proves WebSocket connect + auth scope)
openclaw gateway status --json
openclaw gateway probe --json

# Confirm the ACTUAL workspace path your install uses
openclaw config get agents.defaults.workspace

# Confirm the ACTUAL gateway port
openclaw config get gateway.port

# Inspect the full config (token lives here under gateway.auth.token — keep secret)
cat ~/.openclaw/openclaw.json

# See your state directory contents
ls -la ~/.openclaw

# Check the actual safety posture (all three layers)
openclaw sandbox explain
openclaw approvals get
openclaw config get agents.defaults.sandbox
```

Record the real values returned below. **These override the defaults above.**

| Setting | Default (docs) | Your install (fill in) |
|---|---|---|
| Gateway WS URL | `ws://127.0.0.1:18789` | `__________` |
| Gateway port | `18789` | `__________` |
| Workspace path | `~/.openclaw/workspace` | `__________` |
| State dir | `~/.openclaw` | `__________` |
| Sandbox `mode` | **off** by default | `__________` |
| `workspaceAccess` | `none` (when sandboxed) | `__________` |
| Sandbox backend | `docker` | `__________` |
| Tool policy (allow/deny) | unrestricted by default | `__________` |
| Exec approvals | host-local state | `__________` |
| Auth mode | token | `__________` |

---

## 📌 What this changes in the build plan

1. **Phase 1 (sandbox verification):** drive OpenClaw's own sandbox (`agents.defaults.sandbox`, `mode`, `workspaceAccess`, `~/.openclaw/sandboxes`) and **verify all three safety layers** — sandboxing, tool policy, exec approvals — using `openclaw sandbox explain` / `openclaw approvals get`. Don't redirect paths from outside.
2. **Phase 2 (Manifest Runner):** add up-front work for the **WebSocket auth handshake** (connect frame + token + `operator.read`/`operator.write` scopes). This is more than "send a chat message."
3. **Risk register:** R1 is now *resolved* (values confirmed). R4 (host-file safety) is **confirmed real and worse than assumed** — because sandboxing is OFF by default, the common case is an agent running straight on the host. Your tests should (a) detect whether a sandbox is even in place, and (b) assert the agent could not escape it when it is.
4. **Product positioning sharpened:** the headline test is "is this agent actually contained?" Most installs aren't sandboxed, system-prompt guardrails are soft-only, and CVE-2026-25253 showed a misconfig can mean one-click remote code execution. Lead with **injection resistance + containment verification** (market signal: 42k+ exposed instances, 93.4% with auth-bypass). Sandbox redirection is not your moat; safety verification is.

---

## 🔗 Primary sources (re-check these as OpenClaw changes)
- Gateway CLI & port: `docs.openclaw.ai/cli/gateway`
- Gateway protocol & auth/scopes: `docs.openclaw.ai/gateway/protocol`
- Agent workspace (sandbox caveat): `docs.openclaw.ai/concepts/agent-workspace`
- Agent config (workspace/sandbox keys): `docs.openclaw.ai/gateway/config-agents`
- **Sandboxing (mode/workspaceAccess/backends/Docker):** `docs.openclaw.ai/gateway/sandboxing`
- **Sandbox vs tool policy vs elevated (the 3 layers):** `docs.openclaw.ai/gateway/sandbox-vs-tool-policy-vs-elevated`
- **Security / prompt-injection model:** `docs.openclaw.ai/gateway/security`
- Repo / runtime / Node version: `github.com/openclaw/openclaw`

*Tip: OpenClaw docs pages have a "Copy page as Markdown for LLMs" / "Open in Claude" option — use it to paste exact current specs into Cursor when building.*
