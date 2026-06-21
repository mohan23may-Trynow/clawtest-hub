import { locateOpenclaw } from '../openclaw/locate.js';
import { fixtureRunner, liveRunner, type ExecOutcome, type OpenclawRunner } from '../openclaw/exec.js';
import { parseApprovals, parseSandbox, parseToolPolicy } from '../posture/parse.js';
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
 */
export async function runPosture(opts: PostureOptions): Promise<number> {
  const loc = locateOpenclaw({ stateDir: opts.stateDir });
  const runner: OpenclawRunner = opts.fromFixture ? fixtureRunner(opts.fromFixture) : liveRunner();

  const sandboxOut = await runner.run(['sandbox', 'explain', '--json']);
  if (sandboxOut.status !== 'ok') return reportUnavailable(sandboxOut);

  const approvalsOut = await runner.run(['approvals', 'get', '--json']);
  if (approvalsOut.status !== 'ok') return reportUnavailable(approvalsOut);

  const toolsOut = await runner.run(['config', 'get', 'tools', '--json']);
  if (toolsOut.status !== 'ok') return reportUnavailable(toolsOut);

  let snapshot: PostureSnapshot;
  try {
    snapshot = {
      sandbox: parseSandbox(sandboxOut.stdout),
      approvals: parseApprovals(approvalsOut.stdout),
      toolPolicy: parseToolPolicy(toolsOut.stdout),
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
