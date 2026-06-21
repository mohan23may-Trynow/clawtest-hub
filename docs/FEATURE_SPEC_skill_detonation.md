# Feature Spec — Skill Detonation Vetting

*For Claude Code · build AFTER Phase 2 is complete · keep the same discipline (verify real flags first, least-privilege, never touch the real workspace/config, commit per step).*

---

## Goal

Add a command that runs an untrusted ClawHub skill in an isolated sandbox and reports **what it actually does**, so a user can decide whether to trust it before installing it for real.

```
clawtest-hub detonate <skill-name-or-path> [--json] [--timeout <s>]
```

Output: a behavioral report + a verdict (`PASS` / `WARN` / `FAIL`), each finding backed by observed evidence and (on FAIL) the specific red flag.

## Why this matters (context)

ClawHub has 800+ known-malicious skills (~20% of the registry); skills run with the agent's full permissions, and OpenClaw's only defense is weak user-reporting. Existing tools are mostly **static** scanners — they grep code/SKILL.md for known-bad patterns and miss obfuscated or remote-fetched payloads. This feature is **dynamic / behavioral**: detonate it and watch. That's the differentiator.

## How it works (build ON OpenClaw, don't reinvent)

1. **Resolve the skill** from ClawHub by name, or from a local path — **without** installing it into the user's real OpenClaw.
2. **Create an isolated throwaway agent** with the skill loaded:
   - workspace under a gitignored sandbox dir (reuse the Phase-2 `.sandbox-tmp/` pattern and `src/safety/guards.ts` so the real workspace/config is never touched),
   - OpenClaw's **Docker sandbox ON**, `workspaceAccess: none` (or `ro`), **network off** by default,
   - reuse the `openclaw agents add --non-interactive --workspace <dir> --model <id>` flow already verified in Phase 2.
3. **Drive it** via `openclaw agent --json` with a benign trigger (and/or just load the skill and observe its setup/first-run behavior).
4. **Observe & instrument** — capture, from the `--json` output and the sandbox:
   - file accesses (esp. reaching for `~/.clawdbot/.env`, `~/.openclaw`, keychains, documents),
   - network egress attempts (any outbound to non-allowlisted hosts/webhooks),
   - shell/`exec`/`process` spawns and reverse-shell patterns,
   - remote-script fetch-then-execute,
   - sensitive tool invocations,
   - prompt-injection markers embedded in the `SKILL.md`.
5. **Evaluate** observed behavior against red-flag heuristics → verdict.
6. **Report**: a plain-language behavioral summary + verdict + evidence. Reuse the existing report module.

## Safety requirements (CRITICAL)

You will be running potentially-real malware, so:
- The detonation sandbox must be **strongly isolated** (Docker sandbox, no host workspace access, no network by default). 
- **Fail closed:** if the tool cannot establish isolation, it must refuse to run and say so — never detonate uncontained.
- **Dog-food:** run the existing Phase-1 `posture` check on the detonation sandbox itself before detonating, to confirm containment.
- Never write to the user's real `~/.openclaw` config or real workspace.

## Verify-first (before writing code)

The binary is ground truth (docs/notes have been wrong 3x):
- Confirm the real `openclaw` mechanism for loading/installing a skill into an *isolated* agent on v2026.x (e.g. `openclaw skills ...`, ClawHub fetch, or per-agent skill config) — check `--help` against the installed binary.
- Capture a real fixture by detonating one **benign** skill end-to-end; inspect what the `--json` + sandbox actually expose before designing the evaluator.
- Update `INTEGRATION_NOTES.md` with the verified command(s) + observed-behavior shape.

## Out of scope for v1

- Static source scanning (crowded lane — ClawNet, Snyk mcp-scan, Cisco already there).
- Real-time/continuous monitoring and any GUI.
- A trust *score* or registry. v1 = detonate one skill, report observed behavior + verdict.

## Test plan

Build three local fixtures (do **not** use a real malware sample):
- a benign skill → expect `PASS`,
- a noisy-but-benign skill (e.g. writes several files) → expect `WARN`,
- a synthetic "malicious" skill you author that tries to read a fake `.env` and call out to a local sink → expect `FAIL` with the exact red flags.

Plus the usual: unit tests for the evaluator, and confirm the detonation never escapes the sandbox.

## Reuse checklist

- `src/safety/guards.ts` (workspace protection)
- Phase-2 agent driver (`openclaw agent --json`) + the real success/timeout fixtures
- the report module
- the `agents add --non-interactive --workspace` isolation flow
