# Backlog (not yet built)

Ideas captured for later. Nothing here is implemented.

## `--strict` flag — treat WARN as FAIL for CI gating
Both `posture` and `run` currently exit 0 on a `WARN` overall (determinably weak-but-contained).
Add a `--strict` flag that maps **WARN → FAIL** (exit 1) so CI pipelines can gate on "no weaknesses,"
not just "no hard failures." `UNKNOWN` and `FAIL` already exit non-zero regardless.
- Scope: `clawtest-hub posture --strict` and `clawtest-hub run --strict`.
- Keep the default lenient (WARN → exit 0) so local/dev use isn't noisy.
- Verdict/exit mapping lives in `src/report/render.ts` (`exitCodeFor`) and `src/commands/run.ts`.

## Deferred → x86 + Docker milestone (already tracked elsewhere)
- Live end-to-end containment proof (real sandboxed run, `sandbox: all`).
- `network_egress` observability.
- Phase 3 skill-detonation testing.
