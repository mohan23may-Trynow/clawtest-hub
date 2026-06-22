import type { OpenclawLocation } from '../openclaw/locate.js';
import type { LayerResult, PostureResult } from '../posture/evaluate.js';
import type { PostureSnapshot } from '../posture/types.js';
import type { Assert } from '../manifest/schema.js';
import type { AssertResult, AssertStatus } from '../run/asserts.js';
import type { RunRecord, ScenarioVerdict } from '../run/verdict.js';
import type { Manifest } from '../manifest/schema.js';

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Map any verdict/status/decision word to a CSS state class. UNKNOWN is never the green class. */
function cls(word: string): string {
  const w = word.toUpperCase();
  if (w === 'PASS' || w === 'GO') return 'pass';
  if (w === 'WARN') return 'warn';
  if (w === 'UNKNOWN' || w === 'UNKN') return 'unknown';
  return 'fail'; // FAIL, NO-GO
}

function badge(word: string, label = word): string {
  return `<span class="badge ${cls(word)}">${escapeHtml(label)}</span>`;
}

const STYLE = `
  :root{color-scheme:light dark}
  *{box-sizing:border-box}
  body{font:14px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;margin:0;padding:24px;background:#f6f8fa;color:#1f2328}
  .wrap{max-width:860px;margin:0 auto}
  h1{font-size:18px;margin:0 0 2px} .sub{color:#656d76;font-size:12px;margin:0 0 16px}
  .banner{padding:14px 18px;border-radius:8px;font-weight:700;font-size:18px;margin:0 0 18px;border:1px solid}
  .card{background:#fff;border:1px solid #d0d7de;border-radius:8px;padding:14px 16px;margin:0 0 12px}
  .card h2{font-size:14px;margin:0 0 6px}
  .muted{color:#656d76;font-size:12.5px;margin:2px 0}
  .fix{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12px;background:#f6f8fa;border:1px solid #d0d7de;border-radius:6px;padding:6px 8px;margin-top:6px;display:inline-block}
  .badge{display:inline-block;padding:1px 8px;border-radius:999px;font-weight:700;font-size:12px;border:1px solid}
  table{border-collapse:collapse;width:100%;margin:4px 0}
  td{padding:5px 6px;border-bottom:1px solid #eaeef2;vertical-align:top}
  ul{margin:6px 0;padding-left:18px} li{margin:2px 0}
  .pass{background:#e6f4ea;color:#0f5132;border-color:#a3cfbb}
  .warn{background:#fff8e1;color:#7a5b00;border-color:#e6d8a8}
  .unknown{background:#eceff3;color:#3b434c;border-color:#c4ccd6}
  .fail{background:#ffebe9;color:#a4232b;border-color:#f0a8a8}
  .legend .badge{margin-right:6px}
`;

export function htmlDocument(title: string, bannerWord: string, bannerLabel: string, body: string): string {
  const generatedAt = new Date().toISOString();
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>${STYLE}</style></head>
<body><div class="wrap">
<h1>${escapeHtml(title)}</h1>
<p class="sub">clawtest-hub · generated ${escapeHtml(generatedAt)}</p>
<div class="banner ${cls(bannerWord)}">${escapeHtml(bannerLabel)}</div>
<p class="sub legend">${badge('PASS')} ${badge('WARN')} ${badge('UNKNOWN')} ${badge('FAIL')} — UNKNOWN is never treated as pass</p>
${body}
</div></body></html>
`;
}

// ---- posture ----
function layerCard(l: LayerResult): string {
  const details = l.details.map((d) => `<li>${escapeHtml(d)}</li>`).join('');
  const fix = l.fix ? `<div class="fix">to fix: ${escapeHtml(l.fix)}</div>` : '';
  return `<div class="card"><h2>${badge(l.verdict)} ${escapeHtml(l.name)}</h2>
<p class="muted">${escapeHtml(l.summary)}</p><ul>${details}</ul>${fix}</div>`;
}

export function postureHtml(loc: OpenclawLocation, result: PostureResult, _snapshot: PostureSnapshot): string {
  const target = `<div class="card"><h2>target</h2>
<p class="muted">state dir: ${escapeHtml(loc.stateDir)}</p>
<p class="muted">workspace: ${escapeHtml(loc.workspace)}${loc.isRealWorkspace ? ' (your real workspace)' : ''}</p>
<p class="muted">gateway: ${escapeHtml(loc.gatewayUrl)}</p></div>`;
  const body = target + result.layers.map(layerCard).join('');
  return htmlDocument('Agent safety posture', result.overall, `OVERALL: ${result.overall}`, body);
}

// ---- run ----
function describeAssert(a: Assert): string {
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
    case 'secret_in_output':
      return `secret_in_output${a.allow?.length ? ` (allow ${a.allow.length})` : ''}`;
    case 'sensitive_path_touched':
      return `sensitive_path_touched${a.paths?.length ? ` (+${a.paths.length})` : ''}`;
  }
}

function worstFor(records: RunRecord[], kind: 'must' | 'must_not', index: number): AssertStatus {
  let worst: AssertStatus = 'PASS';
  for (const r of records) {
    const res = r.results.filter((x) => x.kind === kind)[index];
    if (!res) continue;
    if (res.status === 'FAIL') return 'FAIL';
    if (res.status === 'UNKNOWN') worst = 'UNKNOWN';
  }
  return worst;
}

function assertTable(asserts: Assert[], records: RunRecord[], kind: 'must' | 'must_not'): string {
  if (!asserts.length) return '';
  const rows = asserts
    .map((a, i) => `<tr><td>${badge(worstFor(records, kind, i))}</td><td>${escapeHtml(describeAssert(a))}</td></tr>`)
    .join('');
  return `<div class="card"><h2>${kind === 'must' ? 'must (positive outcomes)' : 'must_not (safety invariants)'}</h2><table>${rows}</table></div>`;
}

function evidenceList(title: string, items: { runIndex: number; result: AssertResult }[]): string {
  if (!items.length) return '';
  const lis = items
    .map((x) => `<li>run ${x.runIndex}: ${escapeHtml(describeAssert(x.result.assert))} — ${escapeHtml(x.result.evidence)}</li>`)
    .join('');
  return `<div class="card"><h2>${escapeHtml(title)}</h2><ul>${lis}</ul></div>`;
}

export function runHtml(manifest: Manifest, records: RunRecord[], scenario: ScenarioVerdict): string {
  const meta = `<div class="card"><h2>${escapeHtml(manifest.name)}</h2><p class="muted">${scenario.runs} run(s) · ${escapeHtml(scenario.reason)}</p></div>`;
  const body =
    meta +
    assertTable(manifest.must, records, 'must') +
    assertTable(manifest.mustNot, records, 'must_not') +
    evidenceList('safety violations', scenario.violations) +
    evidenceList('unknowns (cannot certify — fail-safe)', scenario.unknowns);
  return htmlDocument(`Run: ${manifest.name}`, scenario.verdict, `VERDICT: ${scenario.verdict}`, body);
}

// ---- preflight ----
export interface PreflightHtmlData {
  overall: 'GO' | 'NO-GO';
  warnings: string[];
  posture: string;
  scenarios: { name: string; verdict: string }[];
}

export function preflightHtml(d: PreflightHtmlData): string {
  const label = d.overall === 'GO' && d.warnings.length ? 'GO (with warnings)' : d.overall;
  const postureCard = `<div class="card"><h2>${badge(d.posture)} safety posture</h2></div>`;
  const scenRows = d.scenarios.map((s) => `<tr><td>${badge(s.verdict)}</td><td>${escapeHtml(s.name)}</td></tr>`).join('');
  const scenCard = `<div class="card"><h2>scenarios</h2><table>${scenRows}</table></div>`;
  const warnCard = d.warnings.length
    ? `<div class="card"><h2>warnings</h2><ul>${d.warnings.map((w) => `<li>${escapeHtml(w)}</li>`).join('')}</ul></div>`
    : '';
  return htmlDocument('Preflight', d.overall, label, postureCard + scenCard + warnCard);
}
