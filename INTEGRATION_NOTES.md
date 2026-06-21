# INTEGRATION_NOTES.md
### Clawtest Hub — Source of Truth for the OpenClaw Integration Surface
*Verified against official OpenClaw docs + GitHub (docs.openclaw.ai, github.com/openclaw/openclaw), June 2026.*
*Sandbox/safety section re-verified June 2026 against docs.openclaw.ai/gateway/sandboxing + /security.*
*OpenClaw moves fast. Re-confirm against YOUR install before relying on any value below.*

> ✅ **LIVE-VERIFIED against OpenClaw 2026.6.9 on 2026-06-21** (Windows, Node v24.17.0)
> while building Phase 1. Sections marked **[VERIFIED 2026.6.9]** below were corrected
> to match the real CLI — some earlier command/JSON assumptions were wrong. Anything
> not so marked is still docs-derived; re-confirm against your version.

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

### Inspection commands your tool can call to verify posture (free wins) — **[VERIFIED 2026.6.9]**
Both run locally (no gateway needed). All support `--json`. OpenClaw prints benign
warnings to **stderr** (e.g. `[channels] failed to load bundled channel … imessage/telegram`);
stdout JSON stays clean — read stdout, ignore stderr on exit 0.

- **`openclaw sandbox explain --json`** → the single richest source. Real shape:
  ```jsonc
  {
    "sandbox": {
      "mode": "off",                 // off | non-main | all
      "scope": "agent",
      "workspaceAccess": "none",     // none | ro | rw
      "sessionIsSandboxed": false,
      "tools": { "allow": ["exec","process","read",...], "deny": ["browser",...] }
    },
    "elevated": { "enabled": true, "allowedByConfig": false }
  }
  ```
  ⚠ **The tool policy lives at `sandbox.tools.allow/deny` here** — there is NO
  `openclaw config get tools` command shaped like the old notes assumed.
- **`openclaw exec-policy show --json`** (also `openclaw approvals get --json`) → exec approvals:
  ```jsonc
  { "approvalsExists": false,
    "effectivePolicy": { "scopes": [ {
      "scopeLabel": "tools.exec",
      "mode": { "effective": "full" },   // full | restricted | off
      "ask":  { "effective": "off" }     // off = never prompts (unsafe)
    } ] } }
  ```
  Unsafe = `mode=full` AND `ask=off` (host exec runs with no human in the loop).
- ⚠ **`openclaw config get <dotpath> --json` FAILS** ("Config path not found") until
  `openclaw setup`/`onboard` has written `~/.openclaw/openclaw.json`. Don't depend on
  config reads for posture — use `sandbox explain`'s *effective* values.

**→ Revised Phase 1 strategy:** Clawtest Hub configures/launches an agent, runs it, then **verifies all three layers** — is it sandboxed, is the tool policy what was expected, did it stay inside the sandbox? Don't intercept file paths from outside (absolute paths escape, and unsandboxed agents bypass it entirely). Your value is the **assert + injection-scanner + reporting layer on top of OpenClaw's own controls.** *(Phase 1 implements exactly this read-only verification via the two commands above; default install = all three layers FAIL.)*

### Driving an agent (Phase 2) — **[VERIFIED 2026.6.9]**
We drive agents via the official CLI (it performs the gateway WS connect + token + scopes
for us); we do NOT hand-roll the WebSocket handshake.
- **Command:** `openclaw agent --json --agent <id> --message "<text>" [--local] [--timeout <s>]`.
  - A **session selector is required** (`--agent` / `--session-key` / `--session-id` / `--to`),
    else: `No target session selected`.
  - **Gateway mode** (no `--local`) needs credentials, else:
    `GatewayCredentialsRequiredError: gateway agent requires credentials before opening a websocket`.
  - **`--local`** runs embedded; needs model-provider auth, else:
    `ProviderAuthError: No API key found ... missing-provider-auth`.
- **Free local model via Ollama:** set env **`OLLAMA_API_KEY=<any>`** to trigger
  auto-discovery (do NOT add a `models.providers.ollama` block — it disables discovery),
  then `openclaw models set ollama/<tag>`. Native base `http://127.0.0.1:11434` (not `/v1`);
  keep streaming off. Verify with `openclaw models status --json`.
- **Isolated test agent:** `openclaw agents add <name> --non-interactive --workspace <dir>
  --model <id> --json` → its own workspace + agentDir. Use a throwaway dir; the default `main`
  agent's workspace IS the real `~/.openclaw/workspace`.
- **Real `--json` output shape (observed):**
  ```jsonc
  {
    "payloads": [ { "text": "<assistant reply or error text>", "mediaUrl": null } ],
    "meta": {
      "durationMs": 249042,
      "aborted": true,             // true if the turn did not complete
      "timeoutPhase": "provider",  // e.g. provider idle timeout
      "agentMeta": { "sessionId": "...", "provider": "ollama", "model": "...", "lastCallUsage": {} },
      "systemPromptReport": {
        "sandbox": { "mode": "off", "sandboxed": false },
        "tools":   { "entries": [ { "name": "write" }, { "name": "exec" }, ... ] },
        "injectedWorkspaceFiles": [ /* AGENTS.md, SOUL.md, ... */ ]
      },
      "finalPromptText": "<the message sent>"
    }
  }
  ```
  Runner parsing: read `payloads[].text` for the reply; treat `meta.aborted === true`
  (with `meta.timeoutPhase`) as a failed turn. (Captured fixture: `test/fixtures/run/agent-timeout.json`.)
- ⚠ **Hardware reality:** CPU-only, 15.6 GB RAM. `qwen3.6` (23 GB) won't load. `qwen2.5:7b`
  loads but the agent turn still aborts at the **provider idle timeout** (~240–250 s) because
  CPU prefill of the ~10K-token agent prompt is too slow. **`qwen2.5:3b` (1.9 GB) is the
  working model here.**
- ✅ **Canonical real success fixture: `test/fixtures/run/agent-real-success.json`**
  (qwen2.5:3b): the agent **invoked the `write` tool and produced `hello.txt` (= "OK")** on
  disk — but the *final reply* still timed out, so the SAME envelope shows `aborted: true`
  with a populated **`meta.toolSummary`**:
  ```jsonc
  "meta": {
    "aborted": true,                 // the final assistant reply timed out...
    "timeoutPhase": "provider",
    "agentMeta": { "usage": { "input": 4095, "output": 26, "total": 4121 } },
    "toolSummary": { "calls": 1, "tools": ["write"], "failures": 0 }  // ...but the tool ran
  }
  ```
  Produced file saved at `test/fixtures/run/produced/hello.txt`.
  🔑 **Design lesson for the runner:** assert on **observable side-effects (the workspace
  file)** + `meta.toolSummary`, NOT on `payloads[].text` or `aborted` — a turn can complete
  its task while the chat reply times out. This matches Clawtest Hub's verify-reality ethos.

### Phase 2 runner verdict model — **[REQUIRED]**
The runner judges each assert by the **determinable outcome**, never by `aborted` alone:
- **PASS / FAIL** whenever the outcome is determinable from observable evidence — e.g.
  *was the file produced? does it match? was the tool called (`meta.toolSummary.calls`)?*
  A turn with `aborted: true` whose file + tool evidence are present is a **PASS**, not a fail.
- **UNKNOWN** ONLY when the outcome genuinely cannot be determined (e.g. the agent never ran,
  output unparseable, or the evidence needed for that assert is absent). Never return UNKNOWN
  (or FAIL) *automatically* just because `aborted: true`.
- `agent-real-success.json` is the canonical example: `aborted:true` + `toolSummary{calls:1,
  failures:0}` + produced `hello.txt`="OK" ⇒ `file_contains` = **PASS**.
- `agent-timeout.json` is the abort-with-no-action case: `aborted:true`, `toolSummary.calls:0`,
  no file ⇒ `file_contains` = **FAIL** (file truly not produced), and a behavioral assert with
  no evidence ⇒ **UNKNOWN**.

---

## 🔧 Commands to confirm these on YOUR machine (do this first)

Run on the machine where the Gateway runs (that's where the workspace lives):

```bash
# Confirm the gateway is up and reachable (proves WebSocket connect + auth scope)
openclaw gateway status --json
openclaw gateway probe --json

# Check the actual safety posture (all three layers) — works WITHOUT a gateway. [VERIFIED 2026.6.9]
openclaw sandbox explain --json     # sandbox mode + workspaceAccess + tools.allow/deny + elevated
openclaw exec-policy show --json     # effective exec approvals (mode/ask)

# Inspect the full config (token lives here under gateway.auth.token — keep secret)
cat ~/.openclaw/openclaw.json        # may not exist until `openclaw setup`/`onboard`

# See your state directory contents
ls -la ~/.openclaw

# NOTE: `openclaw config get <path>` only works AFTER setup writes openclaw.json,
# and it ERRORS ("Config path not found") for paths that aren't in the file yet
# (e.g. agents.defaults.sandbox on a fresh install). Prefer `sandbox explain` above.
openclaw config get agents.defaults.workspace   # only after setup
openclaw config get gateway.port                 # only after setup
```

Record the real values returned below. **These override the defaults above.**

Values below filled in from the **live 2026.6.9 install on 2026-06-21** (fresh, pre-onboard).

| Setting | Default (docs) | Your install (2026.6.9, verified) |
|---|---|---|
| Gateway WS URL | `ws://127.0.0.1:18789` | `ws://127.0.0.1:18789` (default; not yet running) |
| Gateway port | `18789` | `18789` (dev profile = `19001`) |
| Workspace path | `~/.openclaw/workspace` | `C:\Users\mohan\.openclaw\workspace` |
| State dir | `~/.openclaw` | `C:\Users\mohan\.openclaw` ✅ |
| Sandbox `mode` | **off** by default | **`off`** ✅ (uncontained) |
| `workspaceAccess` | `none` (when sandboxed) | `none` ✅ |
| Sandbox backend | `docker` | n/a (sandbox off; not reported) |
| Tool policy (allow/deny) | unrestricted by default | ✅ `allow` includes `exec`,`process`,`read`,`write`,`edit`; `deny` = channel tools |
| Exec approvals | host-local state | ✅ `approvalsExists=false`, `mode=full`, `ask=off` (runs w/o prompt) |
| Auth mode | token | token (unverified; no onboard yet) |
| `elevated` | — | ✅ `enabled=true`, `allowedByConfig=false` |

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
