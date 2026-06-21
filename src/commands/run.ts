import { rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadManifest } from '../manifest/load.js';
import { fixtureAgentDriver, liveAgentDriver, type AgentDriver } from '../openclaw/agent.js';
import { ensureSafeWorkspace, prepareWorkspace } from '../run/workspace.js';
import { getContainmentLive } from '../run/containment.js';
import { observeRun } from '../run/observe.js';
import { evaluateAssert } from '../run/asserts.js';
import { aggregate, type RunRecord } from '../run/verdict.js';
import { buildRunJson, renderRunReport } from '../run/report.js';

export interface RunOptions {
  json?: boolean;
  fromFixture?: string;
  runs?: number;
  unsafeNoSandbox?: boolean;
  agent?: string;
  timeoutSec?: number;
}

/** Phase 2 engine: run a YAML manifest N times, evaluate must/must_not, return exit code. */
export async function runManifest(manifestPath: string, opts: RunOptions): Promise<number> {
  let manifest;
  try {
    manifest = loadManifest(manifestPath);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }

  const manifestDir = dirname(resolve(manifestPath));
  const runs = opts.runs ?? manifest.runs;

  let wsAbs: string;
  try {
    wsAbs = ensureSafeWorkspace(manifest.agent.workspace);
  } catch (e) {
    console.error(e instanceof Error ? e.message : String(e));
    return 2;
  }

  const live = !opts.fromFixture;
  const driver: AgentDriver = opts.fromFixture ? fixtureAgentDriver(opts.fromFixture) : liveAgentDriver();

  if (live && !opts.agent) {
    console.error('Live runs need --agent <id> (or use --from-fixture <dir>).');
    return 2;
  }

  // Fail-closed: never drive an uncontained agent for a safety (must_not) scenario.
  if (live && manifest.mustNot.length > 0 && !opts.unsafeNoSandbox) {
    const c = await getContainmentLive();
    if (!c.determinable || !c.sandboxed) {
      console.error(
        `Refusing to run a safety (must_not) scenario without containment (sandbox mode=${c.mode}). ` +
          'Re-run on an x86+Docker host with sandboxing, or pass --unsafe-no-sandbox to override.',
      );
      return 2;
    }
  }

  const agentId = opts.agent ?? manifest.name;
  const records: RunRecord[] = [];
  for (let i = 0; i < runs; i++) {
    try {
      rmSync(wsAbs, { recursive: true, force: true });
      prepareWorkspace(wsAbs, manifest.fixtures, manifestDir);
    } catch (e) {
      records.push({ runIndex: i, results: [], error: `workspace prep: ${e instanceof Error ? e.message : String(e)}` });
      continue;
    }

    const outcome = await driver.run({
      agent: agentId,
      message: manifest.trigger.message,
      timeoutSec: opts.timeoutSec,
      workspace: wsAbs,
    });

    if (!outcome.ok) {
      if (i === 0 && (outcome.reason === 'not-installed' || outcome.reason === 'no-model' || outcome.reason === 'gateway-not-onboarded')) {
        console.error(outcome.message);
        return 2;
      }
      records.push({ runIndex: i, results: [], error: outcome.message });
      continue;
    }

    const observed = observeRun(outcome, wsAbs);
    const results = [
      ...manifest.must.map((a) => evaluateAssert(a, 'must', observed)),
      ...manifest.mustNot.map((a) => evaluateAssert(a, 'must_not', observed)),
    ];
    records.push({ runIndex: i, results });
  }

  const scenario = aggregate(records, manifest);
  if (opts.json) console.log(JSON.stringify(buildRunJson(manifest, records, scenario), null, 2));
  else console.log(renderRunReport(manifest, records, scenario));

  return scenario.verdict === 'PASS' ? 0 : 1;
}
