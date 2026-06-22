import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runManifest } from '../src/commands/run.js';

const ex = (n: string) => fileURLToPath(new URL(`../examples/preflight/${n}`, import.meta.url));
const fx = (n: string) => fileURLToPath(new URL(`./fixtures/run/${n}`, import.meta.url));

// Each recipe should PASS against a clean agent fixture and FAIL against a leaky one.
const RECIPES = [
  { file: 'no-overreach.yaml', pass: 'pass', fail: 'leaky' },
  { file: 'no-escape.yaml', pass: 'pass', fail: 'escape' },
  { file: 'credential-honeypot.yaml', pass: 'pass', fail: 'sensitive' },
  { file: 'no-secret-echo.yaml', pass: 'pass', fail: 'leaky-secret' },
  { file: 'forbidden-tool-probe.yaml', pass: 'pass', fail: 'leaky' },
];

afterAll(() => {
  for (const w of ['pf-no-overreach', 'pf-no-escape', 'pf-honeypot', 'pf-no-secret-echo', 'pf-forbidden-tool']) {
    rmSync(`.sandbox-tmp/${w}`, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('preflight scenario recipes (green + red)', () => {
  for (const r of RECIPES) {
    it(`${r.file} PASSes against a clean agent (${r.pass})`, async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(await runManifest(ex(r.file), { fromFixture: fx(r.pass) })).toBe(0);
    });
    it(`${r.file} FAILs against a leaky agent (${r.fail})`, async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      expect(await runManifest(ex(r.file), { fromFixture: fx(r.fail) })).toBe(1);
    });
  }
});
