import pc from 'picocolors';
import type { OpenclawLocation } from '../openclaw/locate.js';
import type { PostureResult } from '../posture/evaluate.js';
import type { PostureSnapshot, Verdict } from '../posture/types.js';

export interface JsonReport {
  tool: 'clawtest-hub';
  command: 'posture';
  generatedAt: string;
  overall: Verdict;
  target: {
    stateDir: string;
    workspace: string;
    isRealWorkspace: boolean;
    gatewayUrl: string;
    profile: string;
  };
  layers: PostureResult['layers'];
  snapshot: PostureSnapshot;
}

export function buildJsonReport(
  loc: OpenclawLocation,
  result: PostureResult,
  snapshot: PostureSnapshot,
  generatedAt: string = new Date().toISOString(),
): JsonReport {
  return {
    tool: 'clawtest-hub',
    command: 'posture',
    generatedAt,
    overall: result.overall,
    target: {
      stateDir: loc.stateDir,
      workspace: loc.workspace,
      isRealWorkspace: loc.isRealWorkspace,
      gatewayUrl: loc.gatewayUrl,
      profile: loc.profile,
    },
    layers: result.layers,
    snapshot,
  };
}

/** Map an overall verdict to a process exit code. UNKNOWN is non-zero — never a clean pass. */
export function exitCodeFor(result: PostureResult): number {
  return result.overall === 'FAIL' || result.overall === 'UNKNOWN' ? 1 : 0;
}

function badge(v: Verdict): string {
  if (v === 'PASS') return pc.bold(pc.green(' PASS '));
  if (v === 'WARN') return pc.bold(pc.yellow(' WARN '));
  if (v === 'UNKNOWN') return pc.bold(pc.yellow(' UNKN '));
  return pc.bold(pc.red(' FAIL '));
}

function plainSummary(v: Verdict): string {
  if (v === 'PASS') return pc.green('This agent looks contained. The three safety layers all passed.');
  if (v === 'WARN')
    return pc.yellow('This agent is mostly contained, but some safety settings are weaker than ideal.');
  if (v === 'UNKNOWN')
    return pc.yellow('Could NOT determine containment (unexpected/missing data). Failing safe — this is NOT a pass.');
  return pc.red('This agent is NOT contained. Do not trust it with real files until you fix the FAILs below.');
}

export function renderHuman(
  loc: OpenclawLocation,
  result: PostureResult,
  _snapshot: PostureSnapshot,
): string {
  const lines: string[] = [];
  lines.push('');
  lines.push(pc.bold('Clawtest Hub — agent safety posture'));
  lines.push(pc.dim(`  state dir : ${loc.stateDir}`));
  lines.push(
    pc.dim(
      `  workspace : ${loc.workspace}${loc.isRealWorkspace ? pc.yellow('  (your real workspace)') : ''}`,
    ),
  );
  lines.push(pc.dim(`  gateway   : ${loc.gatewayUrl}`));
  lines.push('');

  for (const layer of result.layers) {
    lines.push(`${badge(layer.verdict)} ${pc.bold(layer.name)} — ${layer.summary}`);
    for (const d of layer.details) {
      lines.push(pc.dim(`        ${d}`));
    }
    if (layer.fix) {
      lines.push(`        ${pc.cyan('to fix:')} ${layer.fix}`);
    }
    lines.push('');
  }

  lines.push(`${badge(result.overall)} ${pc.bold('OVERALL')}`);
  lines.push(`  ${plainSummary(result.overall)}`);
  lines.push('');
  lines.push(
    pc.dim(
      'Note: this is a read-only verification. Actually driving an agent over the gateway ' +
        'comes in Phase 2 — Phase 1 judges the posture an agent would run under.',
    ),
  );
  lines.push('');
  return lines.join('\n');
}
