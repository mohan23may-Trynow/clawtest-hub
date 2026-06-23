import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { escapeHtml, postureHtml, preflightHtml, runHtml } from '../src/report/html.js';
import { evaluatePosture } from '../src/posture/evaluate.js';
import type { PostureSnapshot } from '../src/posture/types.js';
import type { OpenclawLocation } from '../src/openclaw/locate.js';
import type { Manifest } from '../src/manifest/schema.js';
import type { AssertResult } from '../src/run/asserts.js';
import { aggregate, type RunRecord } from '../src/run/verdict.js';
import { executeManifest, runManifest } from '../src/commands/run.js';
import { runPosture } from '../src/commands/posture.js';
import { runPreflight } from '../src/commands/preflight.js';

const fxRun = (n: string) => fileURLToPath(new URL(`./fixtures/run/${n}`, import.meta.url));
const fxTop = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'clawtest-html-'));
const META = { version: '9.9.9', source: 'fixture: test' };

const loc: OpenclawLocation = {
  stateDir: '/h/.openclaw',
  configPath: '/h/.openclaw/openclaw.json',
  configExists: true,
  workspace: '/h/.openclaw/workspace',
  gatewayPort: 18789,
  gatewayUrl: 'ws://127.0.0.1:18789',
  profile: 'default',
  isRealWorkspace: true,
};

function selfContained(html: string): void {
  expect(html.startsWith('<!doctype html>')).toBe(true);
  expect(html).not.toMatch(/<script/i); // no JS
  expect(html).not.toMatch(/https?:\/\//i); // no external fetch
}

afterAll(() => {
  rmSync(tmp, { recursive: true, force: true });
  for (const w of ['secret-leak', 'pf-no-overreach', 'pf-no-escape', 'pf-honeypot', 'pf-no-secret-echo', 'pf-forbidden-tool']) {
    rmSync(join('.sandbox-tmp', w), { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('escapeHtml', () => {
  it('neutralizes markup characters', () => {
    expect(escapeHtml('<b>&"\'</b>')).toBe('&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  });
});

describe('postureHtml', () => {
  const failSnap: PostureSnapshot = {
    sandbox: { mode: 'off', sessionIsSandboxed: false },
    toolPolicy: { allow: ['exec'], deny: [] },
    elevated: { enabled: true, allowedByConfig: false },
    execPolicy: { approvalsExists: false, scopes: [{ label: 'tools.exec', modeEffective: 'full', askEffective: 'off' }] },
  };

  it('renders a FAIL posture, self-contained, with a self-describing header', () => {
    const html = postureHtml(loc, evaluatePosture(failSnap), failSnap, META);
    selfContained(html);
    expect(html).toContain('class="banner fail"');
    expect(html).toContain('Tested');
    expect(html).toContain('Source');
    expect(html).toContain('clawtest-hub 9.9.9');
    expect(html).toContain('Generated');
    expect(html).toContain('&#39;'); // the `to fix:` command's quotes are escaped
  });

  it('fail-safe: UNKNOWN posture renders unknown, never the pass/green class', () => {
    const snap: PostureSnapshot = {
      sandbox: { mode: 'unknown' },
      toolPolicy: { allow: [], deny: [] },
      elevated: { enabled: false, allowedByConfig: false },
      execPolicy: { approvalsExists: false, scopes: [] },
    };
    const html = postureHtml(loc, evaluatePosture(snap), snap, META);
    expect(html).toContain('class="banner unknown"');
    expect(html).not.toContain('class="banner pass"');
  });
});

describe('runHtml', () => {
  it('renders a FAIL run with REDACTED secret evidence (never the full secret)', async () => {
    const r = await executeManifest(fxRun('secret.fail.yaml'), { fromFixture: fxRun('leaky-secret') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const html = runHtml(r.manifest, r.records, r.scenario, META);
    selfContained(html);
    expect(html).toContain('AKIA'); // redacted prefix shown
    expect(html).not.toContain('AKIAIOSFODNN7EXAMPLE'); // full secret never written
    expect(html).toContain('Runs'); // header includes run count
  });

  it('escapes EVERY dynamic field — scenario name, paths, source — no raw markup survives', () => {
    const manifest: Manifest = {
      name: 'inj<script>x</script>',
      agent: { workspace: '.sandbox-tmp/x' },
      runs: 1,
      trigger: { message: 'm' },
      fixtures: [],
      must: [],
      mustNot: [{ type: 'read_path', path: '<script>evil</script>' }],
      verdict: { must: 'all', mustNot: 'zero_violations' },
    };
    const results: AssertResult[] = [{ assert: manifest.mustNot[0]!, kind: 'must_not', status: 'PASS', evidence: 'clean' }];
    const records: RunRecord[] = [{ runIndex: 0, results }];
    const html = runHtml(manifest, records, aggregate(records, manifest), { version: '1', source: 'fixture: <s>' });
    expect(html).not.toContain('<script>evil');
    expect(html).not.toContain('inj<script>');
    expect(html).toContain('&lt;script&gt;evil'); // path escaped
    expect(html).toContain('&lt;s&gt;'); // source escaped
  });
});

describe('preflightHtml', () => {
  it('NO-GO renders red; GO-with-warnings label in text; escapes scenario names + warnings', () => {
    const nogo = preflightHtml({ overall: 'NO-GO', warnings: [], posture: 'FAIL', scenarios: [{ name: 'x', verdict: 'FAIL' }] }, META);
    selfContained(nogo);
    expect(nogo).toContain('class="banner fail"');

    const warn = preflightHtml(
      { overall: 'GO', warnings: ['<b>weak</b>'], posture: 'WARN', scenarios: [{ name: 'scen<i>', verdict: 'PASS' }] },
      META,
    );
    expect(warn).toContain('GO (with warnings)');
    expect(warn).toContain('class="banner pass"');
    expect(warn).not.toContain('<b>weak</b>'); // warning escaped
    expect(warn).toContain('&lt;b&gt;weak&lt;/b&gt;');
    expect(warn).not.toContain('scen<i>'); // scenario name escaped
  });
});

describe('--html command output', () => {
  it('posture --html writes a self-contained file; exit code unchanged', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = join(tmp, 'posture.html');
    const code = await runPosture({ fromFixture: fxTop('unsafe'), html: out });
    expect(code).toBe(1);
    expect(readFileSync(out, 'utf8').startsWith('<!doctype html>')).toBe(true);
  });

  it('run --html writes a file', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = join(tmp, 'run.html');
    const code = await runManifest(fxRun('secret.fail.yaml'), { fromFixture: fxRun('leaky-secret'), html: out });
    expect(code).toBe(1);
    expect(existsSync(out)).toBe(true);
  });

  it('preflight --html writes a file', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const out = join(tmp, 'preflight.html');
    const code = await runPreflight({ fromFixture: fileURLToPath(new URL('./fixtures/preflight/clean', import.meta.url)), html: out });
    expect(code).toBe(0);
    expect(readFileSync(out, 'utf8')).toContain('class="banner pass"');
  });
});
