import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { escapeHtml, postureHtml, preflightHtml, runHtml } from '../src/report/html.js';
import { evaluatePosture } from '../src/posture/evaluate.js';
import type { PostureSnapshot } from '../src/posture/types.js';
import type { OpenclawLocation } from '../src/openclaw/locate.js';
import { executeManifest, runManifest } from '../src/commands/run.js';
import { runPosture } from '../src/commands/posture.js';
import { runPreflight } from '../src/commands/preflight.js';

const fxRun = (n: string) => fileURLToPath(new URL(`./fixtures/run/${n}`, import.meta.url));
const fxTop = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));
const tmp = mkdtempSync(join(tmpdir(), 'clawtest-html-'));

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
    rmSync(`.sandbox-tmp/${w}`, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('escapeHtml', () => {
  it('neutralizes markup characters', () => {
    expect(escapeHtml('<b>&"\'</b>')).toBe('&lt;b&gt;&amp;&quot;&#39;&lt;/b&gt;');
  });
});

describe('postureHtml', () => {
  it('renders a FAIL posture, self-contained', () => {
    const snap: PostureSnapshot = {
      sandbox: { mode: 'off', sessionIsSandboxed: false },
      toolPolicy: { allow: ['exec'], deny: [] },
      elevated: { enabled: true, allowedByConfig: false },
      execPolicy: { approvalsExists: false, scopes: [{ label: 'tools.exec', modeEffective: 'full', askEffective: 'off' }] },
    };
    const html = postureHtml(loc, evaluatePosture(snap), snap);
    selfContained(html);
    expect(html).toContain('FAIL');
    expect(html).toContain('class="banner fail"');
  });

  it('fail-safe: UNKNOWN posture renders unknown, never the pass/green class', () => {
    const snap: PostureSnapshot = {
      sandbox: { mode: 'unknown' },
      toolPolicy: { allow: [], deny: [] },
      elevated: { enabled: false, allowedByConfig: false },
      execPolicy: { approvalsExists: false, scopes: [] },
    };
    const html = postureHtml(loc, evaluatePosture(snap), snap);
    expect(html).toContain('class="banner unknown"');
    expect(html).toContain('UNKNOWN');
    expect(html).not.toContain('class="banner pass"');
  });
});

describe('runHtml', () => {
  it('renders a FAIL run with REDACTED secret evidence (never the full secret)', async () => {
    const r = await executeManifest(fxRun('secret.fail.yaml'), { fromFixture: fxRun('leaky-secret') });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const html = runHtml(r.manifest, r.records, r.scenario);
    selfContained(html);
    expect(html).toContain('FAIL');
    expect(html).toContain('AKIA'); // redacted prefix shown
    expect(html).not.toContain('AKIAIOSFODNN7EXAMPLE'); // full secret never written
  });
});

describe('preflightHtml', () => {
  it('NO-GO renders red, GO-with-warnings labels in text but stays self-contained', () => {
    const nogo = preflightHtml({ overall: 'NO-GO', warnings: [], posture: 'FAIL', scenarios: [{ name: 'x', verdict: 'FAIL' }] });
    selfContained(nogo);
    expect(nogo).toContain('NO-GO');
    expect(nogo).toContain('class="banner fail"');

    const warn = preflightHtml({ overall: 'GO', warnings: ['Sandboxing: weak'], posture: 'WARN', scenarios: [{ name: 'y', verdict: 'PASS' }] });
    expect(warn).toContain('GO (with warnings)');
    expect(warn).toContain('Sandboxing: weak');
    expect(warn).toContain('class="banner pass"');
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
