import { writeFileSync } from 'node:fs';
import { locateOpenclaw, type OpenclawLocation } from '../openclaw/locate.js';
import { fixtureRunner, liveRunner, type OpenclawRunner } from '../openclaw/exec.js';
import { parseExecPolicy, parseSandboxExplain } from '../posture/parse.js';
import { evaluatePosture, type PostureResult } from '../posture/evaluate.js';
import type { PostureSnapshot } from '../posture/types.js';
import { buildJsonReport, exitCodeFor, renderHuman } from '../report/render.js';
import { postureHtml } from '../report/html.js';
import { toolVersion } from '../version.js';

export interface PostureOptions {
  json?: boolean;
  stateDir?: string;
  fromFixture?: string;
  html?: string | boolean;
}

export type PostureGather =
  | { status: 'ok'; result: PostureResult; loc: OpenclawLocation; snapshot: PostureSnapshot }
  | { status: 'unavailable'; message: string };

/** Inspect + evaluate the safety posture. No printing/exit — returns the result for composition. */
export async function gatherPosture(opts: PostureOptions): Promise<PostureGather> {
  const loc = locateOpenclaw({ stateDir: opts.stateDir });
  const runner: OpenclawRunner = opts.fromFixture ? fixtureRunner(opts.fromFixture) : liveRunner();

  const sandboxOut = await runner.run(['sandbox', 'explain', '--json']);
  if (sandboxOut.status !== 'ok') return unavailable(sandboxOut);
  const execPolicyOut = await runner.run(['exec-policy', 'show', '--json']);
  if (execPolicyOut.status !== 'ok') return unavailable(execPolicyOut);

  try {
    const explain = parseSandboxExplain(sandboxOut.stdout);
    const snapshot: PostureSnapshot = {
      sandbox: explain.sandbox,
      toolPolicy: explain.toolPolicy,
      elevated: explain.elevated,
      execPolicy: parseExecPolicy(execPolicyOut.stdout),
    };
    return { status: 'ok', result: evaluatePosture(snapshot), loc, snapshot };
  } catch (err) {
    return {
      status: 'unavailable',
      message: `Could not understand OpenClaw's output: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/** Phase 1 `posture` command: gather, print the report, return the exit code. */
export async function runPosture(opts: PostureOptions): Promise<number> {
  const g = await gatherPosture(opts);
  if (g.status !== 'ok') {
    console.error(g.message);
    return 2;
  }
  if (opts.html !== undefined && opts.html !== false) {
    const path = typeof opts.html === 'string' ? opts.html : 'posture-report.html';
    const source = opts.fromFixture ? `fixture: ${opts.fromFixture}` : `live: ${g.loc.stateDir}`;
    writeFileSync(path, postureHtml(g.loc, g.result, g.snapshot, { version: toolVersion(), source }));
    console.log(`Wrote ${path}`);
  } else if (opts.json) {
    console.log(JSON.stringify(buildJsonReport(g.loc, g.result, g.snapshot), null, 2));
  } else {
    console.log(renderHuman(g.loc, g.result, g.snapshot));
  }
  return exitCodeFor(g.result);
}

function unavailable(outcome: { message: string; stderr?: string }): PostureGather {
  const extra = outcome.stderr?.trim() ? `\n${outcome.stderr.trim()}` : '';
  return { status: 'unavailable', message: `${outcome.message}${extra}` };
}
