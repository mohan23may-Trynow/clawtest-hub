# START HERE 👋

This folder is the starter kit for **Clawtest Hub**. You don't need to write any code — Claude Code will do the building. Your job is to set things up, then approve its plans.

## Step 1 — One-time setup (do this first)
1. Subscribe to a **Claude plan** (you're on Max — you're set) and install the **Claude desktop app** (lets you use Claude Code without a terminal).
2. Install **Git** (for saving versions).
3. Install **OpenClaw** from openclaw.ai (you need a real agent to test against).

## Step 2 — Confirm your real values
Open OpenClaw and run the commands listed in **`INTEGRATION_NOTES.md`** (the "Commands to confirm" section). Fill in the blank table there with what your machine returns. If the gateway responds, you're cleared to build.

## Step 3 — Open this folder in Claude Code
Put this whole folder somewhere sensible (e.g. `~/clawtest-hub`), then open it in the Claude desktop app.

## Step 4 — Your first message to Claude Code
Paste this:

> "Read CLAUDE.md and INTEGRATION_NOTES.md so you understand the project. Then use Plan Mode to propose Phase 1: set up the `clawtest-hub` TypeScript/Node CLI skeleton, and the first feature that launches an OpenClaw agent with sandboxing enabled and verifies its safety posture using `openclaw sandbox explain` and `openclaw approvals get`. Show me the plan before writing any code, and tell me the exact commands to run it."

Read the plan it gives you, approve it, and let it build. When Phase 1 works, move to Phase 2 (a fresh session — type `/clear` first).

## What's in this folder
- `CLAUDE.md` — the project's memory (Claude Code reads this every session).
- `INTEGRATION_NOTES.md` — verified OpenClaw facts. Your source of truth.
- `tests/lead_gen_test.yaml` — a sample test so there's a concrete target to build toward.
- `tests/mocks/dirty_leads.csv` — a messy sample file the test uses.
- `tests/payloads/injection_basic.md` — a sample attack for the injection scanner.
- `.gitignore` — keeps secrets and junk out of your saved versions.

## Handy Claude Code commands
- `/cost` — see how much usage you've spent this session.
- `/usage` — see how much of your plan is left.
- `/clear` — start a fresh session (do this between phases).
- `/compact` — shrink a long session to save context.
