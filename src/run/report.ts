import pc from 'picocolors';
import type { Manifest } from '../manifest/schema.js';
import type { AssertResult, AssertStatus } from './asserts.js';
import type { RunRecord, ScenarioVerdict, Verdict } from './verdict.js';

function badge(s: AssertStatus | Verdict): string {
  if (s === 'PASS') return pc.bold(pc.green(' PASS '));
  if (s === 'FAIL') return pc.bold(pc.red(' FAIL '));
  return pc.bold(pc.yellow(` ${s} `)); // UNKNOWN
}

function describe(a: AssertResult['assert']): string {
  switch (a.type) {
    case 'file_contains':
      return `file_contains ${a.path}${a.text ? ` ~ "${a.text}"` : ''}${a.expected_count !== undefined ? ` (${a.expected_count} rows)` : ''}`;
    case 'read_path':
      return `read_path ${a.path}`;
    case 'write_path':
      return `write_path ${a.path}`;
    case 'tool_called':
      return `tool_called ${a.tool}`;
    case 'write_outside_workspace':
      return `write_outside_workspace ${a.value}`;
    case 'network_egress':
      return `network_egress ${a.pattern}`;
  }
}

/** Worst status for an assert across all runs (FAIL > UNKNOWN > PASS). */
function worstFor(records: RunRecord[], kind: 'must' | 'must_not', index: number): AssertStatus {
  let worst: AssertStatus = 'PASS';
  for (const r of records) {
    const list = r.results.filter((x) => x.kind === kind);
    const res = list[index];
    if (!res) continue;
    if (res.status === 'FAIL') return 'FAIL';
    if (res.status === 'UNKNOWN') worst = 'UNKNOWN';
  }
  return worst;
}

export interface RunJsonReport {
  tool: 'clawtest-hub';
  command: 'run';
  scenario: string;
  generatedAt: string;
  verdict: Verdict;
  runs: number;
  satisfiedRuns: number;
  violations: { runIndex: number; assert: string; evidence: string }[];
  unknowns: { runIndex: number; assert: string; evidence: string }[];
  erroredRuns: number[];
  reason: string;
}

export function buildRunJson(
  manifest: Manifest,
  records: RunRecord[],
  v: ScenarioVerdict,
  generatedAt: string = new Date().toISOString(),
): RunJsonReport {
  return {
    tool: 'clawtest-hub',
    command: 'run',
    scenario: manifest.name,
    generatedAt,
    verdict: v.verdict,
    runs: v.runs,
    satisfiedRuns: v.satisfiedRuns,
    violations: v.violations.map((x) => ({ runIndex: x.runIndex, assert: describe(x.result.assert), evidence: x.result.evidence })),
    unknowns: v.unknowns.map((x) => ({ runIndex: x.runIndex, assert: describe(x.result.assert), evidence: x.result.evidence })),
    erroredRuns: v.erroredRuns,
    reason: v.reason,
  };
}

export function renderRunReport(manifest: Manifest, records: RunRecord[], v: ScenarioVerdict): string {
  const out: string[] = ['', pc.bold(`Clawtest Hub — run: ${manifest.name}`), pc.dim(`  ${v.runs} run(s)`), ''];

  if (manifest.must.length) {
    out.push(pc.bold('  must (positive outcomes):'));
    manifest.must.forEach((a, i) => out.push(`    ${badge(worstFor(records, 'must', i))} ${describe(a)}`));
  }
  if (manifest.mustNot.length) {
    out.push(pc.bold('  must_not (safety invariants):'));
    manifest.mustNot.forEach((a, i) => out.push(`    ${badge(worstFor(records, 'must_not', i))} ${describe(a)}`));
  }
  out.push('');

  if (v.violations.length) {
    out.push(pc.red('  safety violations:'));
    for (const x of v.violations) out.push(pc.red(`    run ${x.runIndex}: ${describe(x.result.assert)} — ${x.result.evidence}`));
  }
  if (v.unknowns.length) {
    out.push(pc.yellow('  unknowns (cannot certify — fail-safe):'));
    for (const x of v.unknowns) out.push(pc.dim(`    run ${x.runIndex}: ${describe(x.result.assert)} — ${x.result.evidence}`));
  }
  if (v.erroredRuns.length) out.push(pc.yellow(`  errored runs: ${v.erroredRuns.join(', ')}`));

  out.push('', `${badge(v.verdict)} ${pc.bold('VERDICT')} — ${v.reason}`, '');
  return out.join('\n');
}
