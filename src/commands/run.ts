import { rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { loadManifest } from '../manifest/load.js';
import type { Manifest } from '../manifest/schema.js';
import { fixtureAgentDriver, liveAgentDriver, type AgentDriver } from '../openclaw/agent.js';
import { ensureSafeWorkspace, prepareWorkspace } from '../run/workspace.js';
import { containmentGate, dockerAvailable, getContainmentLive } from '../run/containment.js';
import { observeRun } from '../run/observe.js';
import { evaluateAssert } from '../run/asserts.js';
import { aggregate, type RunRecord, type ScenarioVerdict } from '../run/verdict.js';
import { buildRunJson, renderRunReport } from '../run/report.js';
import { runHtml } from '../report/html.js';
import { toolVersion } from '../version.js';

export interface RunOptions {
  json?: boolean;
  fromFixture?: string;
  runs?: number;
  unsafeNoSandbox?: boolean;
  agent?: string;
  timeoutSec?: number;
  html?: string | boolean;
}

export type ExecuteResult =
  | { ok: true; manifest: Manifest; records: RunRecord[]; scenario: ScenarioVerdict }
  | { ok: false; code: number; message: string };

/** A degraded scenario: outcome could not be determined (e.g. no containment). UNKNOWN, never PASS. */
function unknownScenario(reason: string): ScenarioVerdict {
  return { verdict: 'UNKNOWN', runs: 0, satisfiedRuns: 0, violations: [], unknowns: [], erroredRuns: [], reason };
}

/** Core: load + drive a manifest N times and aggregate a verdict. No printing, no process.exit. */
export async function executeManifest(manifestPath: string, opts: RunOptions): Promise<ExecuteResult> {
  let manifest: Manifest;
  try {
    manifest = loadManifest(manifestPath);
  } catch (e) {
    return { ok: false, code: 2, message: e instanceof Error ? e.message : String(e) };
  }

  const manifestDir = dirname(resolve(manifestPath));
  const runs = opts.runs ?? manifest.runs;

  let wsAbs: string;
  try {
    wsAbs = ensureSafeWorkspace(manifest.agent.workspace);
  } catch (e) {
    return { ok: false, code: 2, message: e instanceof Error ? e.message : String(e) };
  }

  const live = !opts.fromFixture;
  const driver: AgentDriver = opts.fromFixture ? fixtureAgentDriver(opts.fromFixture) : liveAgentDriver();

  if (live && !opts.agent) {
    return { ok: false, code: 2, message: `Live runs need --agent <id> (or use --from-fixture <dir>). [${manifest.name}]` };
  }

  // Fail-safe: never drive an uncontained agent for a safety (must_not) scenario. If containment
  // can't be established (e.g. Docker absent), degrade to an UNKNOWN verdict — never crash, never PASS.
  if (live && manifest.mustNot.length > 0 && !opts.unsafeNoSandbox) {
    const c = await getContainmentLive();
    const gate = containmentGate({
      live: true,
      hasSafetyAsserts: true,
      unsafeNoSandbox: false,
      sandboxed: c.determinable && c.sandboxed,
      dockerPresent: await dockerAvailable(),
    });
    if (!gate.proceed) {
      return { ok: true, manifest, records: [], scenario: unknownScenario(gate.reason) };
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

    const outcome = await driver.run({ agent: agentId, message: manifest.trigger.message, timeoutSec: opts.timeoutSec, workspace: wsAbs });
    if (!outcome.ok) {
      if (i === 0 && (outcome.reason === 'not-installed' || outcome.reason === 'no-model' || outcome.reason === 'gateway-not-onboarded')) {
        return { ok: false, code: 2, message: outcome.message };
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

  return { ok: true, manifest, records, scenario: aggregate(records, manifest) };
}

/** Phase 2 `run` command: execute a manifest, print the report, return the exit code. */
export async function runManifest(manifestPath: string, opts: RunOptions): Promise<number> {
  const r = await executeManifest(manifestPath, opts);
  if (!r.ok) {
    console.error(r.message);
    return r.code;
  }
  if (opts.html !== undefined && opts.html !== false) {
    const path = typeof opts.html === 'string' ? opts.html : 'run-report.html';
    const source = opts.fromFixture ? `fixture: ${opts.fromFixture}` : `agent: ${opts.agent ?? 'unknown'}`;
    writeFileSync(path, runHtml(r.manifest, r.records, r.scenario, { version: toolVersion(), source }));
    console.log(`Wrote ${path}`);
  } else if (opts.json) {
    console.log(JSON.stringify(buildRunJson(r.manifest, r.records, r.scenario), null, 2));
  } else {
    console.log(renderRunReport(r.manifest, r.records, r.scenario));
  }
  return r.scenario.verdict === 'PASS' ? 0 : 1;
}
