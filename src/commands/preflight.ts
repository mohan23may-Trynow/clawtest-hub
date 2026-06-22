import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import pc from 'picocolors';
import { gatherPosture } from './posture.js';
import { executeManifest } from './run.js';
import { listManifests } from '../run/suite.js';
import { preflightHtml } from '../report/html.js';

/** Default scenario suite ships in the repo at examples/preflight (works from src/ and dist/). */
const DEFAULT_SUITE = fileURLToPath(new URL('../../examples/preflight', import.meta.url));

export interface PreflightOptions {
  fromFixture?: string;
  agent?: string;
  suite?: string;
  json?: boolean;
  stateDir?: string;
  timeoutSec?: number;
  unsafeNoSandbox?: boolean;
  html?: string | boolean;
}

interface ScenarioOutcome {
  name: string;
  verdict: string; // PASS | FAIL | UNKNOWN
  reason: string;
}

function badge(v: string): string {
  if (v === 'PASS') return pc.bold(pc.green(' PASS '));
  if (v === 'FAIL') return pc.bold(pc.red(' FAIL '));
  if (v === 'WARN') return pc.bold(pc.yellow(' WARN '));
  return pc.bold(pc.yellow(` ${v} `)); // UNKNOWN
}

/**
 * One-stop go/no-go gate: composes the posture engine + the scenario suite (no new checks).
 * Fail-safe: GO only if posture is PASS/WARN AND every scenario PASSes; any FAIL/UNKNOWN ⇒ NO-GO.
 */
export async function runPreflight(opts: PreflightOptions): Promise<number> {
  // 1) Safety posture
  // On a usage/exit-2 error, emit a clear error OBJECT (in JSON mode) instead of half a payload.
  const fail = (message: string): number => {
    if (opts.json) console.log(JSON.stringify({ tool: 'clawtest-hub', command: 'preflight', error: message }, null, 2));
    else console.error(`preflight: ${message}`);
    return 2;
  };

  const g = await gatherPosture({ stateDir: opts.stateDir, fromFixture: opts.fromFixture });
  if (g.status !== 'ok') return fail(`cannot determine safety posture — ${g.message}`);
  const posture = g.result.overall;

  // 2) Scenario suite
  const suiteDir = opts.suite ?? DEFAULT_SUITE;
  const manifests = listManifests(suiteDir);
  if (manifests.length === 0) return fail(`no manifests found in suite dir: ${suiteDir}`);

  const scenarios: ScenarioOutcome[] = [];
  for (const m of manifests) {
    const r = await executeManifest(m, {
      fromFixture: opts.fromFixture,
      agent: opts.agent,
      timeoutSec: opts.timeoutSec,
      unsafeNoSandbox: opts.unsafeNoSandbox,
    });
    if (!r.ok) return fail(`could not run scenario ${basename(m)} — ${r.message}`);
    scenarios.push({ name: r.manifest.name, verdict: r.scenario.verdict, reason: r.scenario.reason });
  }

  // 3) Aggregate (fail-safe)
  const postureGo = posture === 'PASS' || posture === 'WARN';
  const scenariosGo = scenarios.every((s) => s.verdict === 'PASS');
  const go = postureGo && scenariosGo;
  const withWarnings = go && posture === 'WARN';
  const overall = go ? 'GO' : 'NO-GO'; // strict machine enum; "(with warnings)" is text-report only
  // Why a GO had caveats (WARN posture layers). Future --strict: non-empty warnings flip GO -> NO-GO.
  const warnings = g.result.layers.filter((l) => l.verdict === 'WARN').map((l) => `${l.name}: ${l.summary}`);

  if (opts.html !== undefined && opts.html !== false) {
    const path = typeof opts.html === 'string' ? opts.html : 'preflight-report.html';
    writeFileSync(
      path,
      preflightHtml({ overall, warnings, posture, scenarios: scenarios.map((s) => ({ name: s.name, verdict: s.verdict })) }),
    );
    console.log(`Wrote ${path}`);
  } else if (opts.json) {
    console.log(
      JSON.stringify(
        {
          tool: 'clawtest-hub',
          command: 'preflight',
          generatedAt: new Date().toISOString(),
          overall, // 'GO' | 'NO-GO'
          warnings, // string[] — populated when overall is GO but the posture is weak
          posture,
          scenarios,
        },
        null,
        2,
      ),
    );
  } else {
    const lines: string[] = ['', pc.bold('Clawtest Hub — preflight'), ''];
    lines.push(`  ${badge(posture)} ${pc.bold('safety posture')}`);
    lines.push(pc.bold('  scenarios:'));
    for (const s of scenarios) lines.push(`    ${badge(s.verdict)} ${s.name}`);
    lines.push('');
    lines.push(
      go
        ? `${pc.bold(pc.green(` ${withWarnings ? 'GO (with warnings)' : 'GO'} `))} ${withWarnings ? 'contained but with weak settings — review the WARN posture' : 'all safety layers + scenarios passed'}`
        : `${pc.bold(pc.red(' NO-GO '))} ${pc.red('not safe to go live — see the FAIL/UNKNOWN items above')}`,
    );
    lines.push('');
    console.log(lines.join('\n'));
  }

  return go ? 0 : 1;
}
