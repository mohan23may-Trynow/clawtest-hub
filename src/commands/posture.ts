import { locateOpenclaw } from '../openclaw/locate.js';
import { fixtureRunner, liveRunner, type ExecOutcome, type OpenclawRunner } from '../openclaw/exec.js';
import { parseExecPolicy, parseSandboxExplain } from '../posture/parse.js';
import { evaluatePosture } from '../posture/evaluate.js';
import type { PostureSnapshot } from '../posture/types.js';
import { buildJsonReport, exitCodeFor, renderHuman } from '../report/render.js';

export interface PostureOptions {
  json?: boolean;
  stateDir?: string;
  fromFixture?: string;
}

/**
 * Phase 1 engine: inspect an OpenClaw install and judge its safety posture.
 * Returns the process exit code (0 PASS/WARN, 1 FAIL, 2 tool/usage error).
 *
 * Sources (verified against OpenClaw 2026.6.9):
 *   - `openclaw sandbox explain --json` -> sandbox mode + tool policy + elevation
 *   - `openclaw exec-policy show --json` -> effective exec approvals
 */
export async function runPosture(opts: PostureOptions): Promise<number> {
  const loc = locateOpenclaw({ stateDir: opts.stateDir });
  const runner: OpenclawRunner = opts.fromFixture ? fixtureRunner(opts.fromFixture) : liveRunner();

  const sandboxOut = await runner.run(['sandbox', 'explain', '--json']);
  if (sandboxOut.status !== 'ok') return reportUnavailable(sandboxOut);

  const execPolicyOut = await runner.run(['exec-policy', 'show', '--json']);
  if (execPolicyOut.status !== 'ok') return reportUnavailable(execPolicyOut);

  let snapshot: PostureSnapshot;
  try {
    const explain = parseSandboxExplain(sandboxOut.stdout);
    snapshot = {
      sandbox: explain.sandbox,
      toolPolicy: explain.toolPolicy,
      elevated: explain.elevated,
      execPolicy: parseExecPolicy(execPolicyOut.stdout),
    };
  } catch (err) {
    console.error(
      `Could not understand OpenClaw's output: ${err instanceof Error ? err.message : String(err)}`,
    );
    return 2;
  }

  const result = evaluatePosture(snapshot);

  if (opts.json) {
    console.log(JSON.stringify(buildJsonReport(loc, result, snapshot), null, 2));
  } else {
    console.log(renderHuman(loc, result, snapshot));
  }

  return exitCodeFor(result);
}

function reportUnavailable(outcome: Exclude<ExecOutcome, { status: 'ok' }>): number {
  console.error(outcome.message);
  if ('stderr' in outcome && outcome.stderr) {
    console.error(outcome.stderr.trim());
  }
  return 2;
}
