#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import { runPosture } from './commands/posture.js';
import { runManifest } from './commands/run.js';

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
) as { version: string };

const program = new Command();

program
  .name('clawtest-hub')
  .description(
    'Verify whether an OpenClaw agent is actually contained before you trust it with real files.',
  )
  .version(pkg.version, '-v, --version', 'print the clawtest-hub version');

program
  .command('posture')
  .description("Inspect and judge an OpenClaw agent's safety posture across all three layers.")
  .option('--json', 'output a machine-readable JSON report instead of the human report')
  .option(
    '--state-dir <path>',
    'OpenClaw state dir to inspect (default: $OPENCLAW_STATE_DIR or ~/.openclaw)',
  )
  .option(
    '--from-fixture <dir>',
    'read recorded command outputs from <dir> instead of calling the live openclaw CLI',
  )
  .addHelpText(
    'after',
    `
What it checks (OpenClaw's three safety layers):
  1. Sandboxing    where tools run (off = they run on your host)
  2. Tool policy   which tools exist (the hard stop)
  3. Exec approvals whether a host exec command may proceed

Exit codes:
  0  all three safety layers PASS
  1  at least one layer FAILed (the agent is not contained)
  2  tool/usage error (openclaw not installed, gateway unreachable, bad input)

This command is READ-ONLY. It never writes to your OpenClaw config. If something
is unsafe, it prints the exact 'openclaw' command you can run yourself to fix it.
`,
  )
  .action(async (opts: { json?: boolean; stateDir?: string; fromFixture?: string }) => {
    const code = await runPosture({
      json: opts.json,
      stateDir: opts.stateDir,
      fromFixture: opts.fromFixture,
    });
    process.exit(code);
  });

program
  .command('run')
  .argument('<manifest>', 'path to a YAML test manifest')
  .description('Run a YAML test manifest against an OpenClaw agent N times and report a verdict.')
  .option('--json', 'output a machine-readable JSON report')
  .option('--from-fixture <dir>', 'use a recorded agent fixture dir instead of driving a live agent')
  .option('--runs <n>', 'override the manifest runs count', (v) => parseInt(v, 10))
  .option('--agent <id>', 'OpenClaw agent id to drive (required for live runs)')
  .option('--timeout <s>', 'per-run agent timeout in seconds', (v) => parseInt(v, 10))
  .option(
    '--unsafe-no-sandbox',
    'DEV-ONLY escape hatch: allow live safety (must_not) runs without containment. ' +
      'NEVER use this with real untrusted skills/agents — Phase 3 detonation must always be contained.',
  )
  .addHelpText(
    'after',
    `
Verdict model: PASS only when every run satisfies 'must' AND there are zero 'must_not'
violations AND nothing is UNKNOWN. Anything the runner cannot determine (e.g. network
egress, an aborted-with-no-evidence run) yields UNKNOWN and is NEVER reported as PASS.

Exit codes:
  0  verdict PASS
  1  verdict FAIL or UNKNOWN (fail-safe: could not certify)
  2  tool/usage error (bad manifest, openclaw missing, real-workspace refusal, containment refusal)
`,
  )
  .action(
    async (
      manifest: string,
      opts: { json?: boolean; fromFixture?: string; runs?: number; agent?: string; timeout?: number; unsafeNoSandbox?: boolean },
    ) => {
      const code = await runManifest(manifest, {
        json: opts.json,
        fromFixture: opts.fromFixture,
        runs: opts.runs,
        agent: opts.agent,
        timeoutSec: opts.timeout,
        unsafeNoSandbox: opts.unsafeNoSandbox,
      });
      process.exit(code);
    },
  );

program.parseAsync(process.argv).catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(2);
});
