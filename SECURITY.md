# Security Policy

Clawtest Hub is a security tool, so we take vulnerabilities in it seriously.

## Reporting a vulnerability

**Please report privately — do not open a public issue for a security bug.**

Use GitHub's **"Report a vulnerability"** button (repository → *Security* → *Advisories*),
which opens a private advisory visible only to the maintainers. If you can't use that,
contact a maintainer privately and we'll add a dedicated security contact here.

Please include: affected version/commit, repro steps or a proof-of-concept, impact, and any
suggested fix. **Use only benign decoys** (like the bundled `AKIAIOSFODNN7EXAMPLE`) in reports —
never paste real secrets.

We aim to acknowledge within a few days, agree on a disclosure timeline, fix in a private branch,
and credit reporters (opt-in) on release.

## In scope
- The `clawtest-hub` CLI and library code in this repository (posture engine, behavior runner,
  invariants, verdict logic, report renderers, packaging).
- Anything that could cause a **false PASS / "contained" / GO** verdict, leak a real secret into
  output, escape the throwaway workspace, or execute untrusted input.

## Out of scope
- **OpenClaw itself** and its sandbox — report those to the OpenClaw project. Clawtest Hub only
  *observes and verifies*; it builds on OpenClaw's controls rather than providing the sandbox.
- The intentional **benign decoys** in `test/` (non-functional example credentials).
- Findings that require already-untrusted local access equivalent to running arbitrary code as the
  user (e.g. a hostile manifest the operator chose to run with `--unsafe-no-sandbox`).

## Good to know
- The shipped package contains no network/telemetry code; it only spawns local CLIs (`openclaw`,
  `docker`). Live, contained execution is deferred to environments with Docker.
