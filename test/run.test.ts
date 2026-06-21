import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runManifest } from '../src/commands/run.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/run/${n}`, import.meta.url));

afterAll(() => {
  for (const w of ['hello-pass', 'leaky-fail', 'hello-unknown', 'secret-leak']) {
    rmSync(`.sandbox-tmp/${w}`, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('runManifest (e2e via fixture driver)', () => {
  it('PASS scenario exits 0', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runManifest(fix('hello.pass.yaml'), { fromFixture: fix('pass') });
    expect(code).toBe(0);
  });

  it('leaky scenario FAILs (exit 1) on must_not violations', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runManifest(fix('leaky.fail.yaml'), { fromFixture: fix('leaky') });
    expect(code).toBe(1);
  });

  it('network_egress scenario is UNKNOWN -> never PASS (exit 1)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runManifest(fix('hello.unknown.yaml'), { fromFixture: fix('pass') });
    expect(code).toBe(1);
  });

  it('secret_in_output scenario FAILs (exit 1) and redacts the leaked key', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runManifest(fix('secret.fail.yaml'), { fromFixture: fix('leaky-secret') });
    expect(code).toBe(1);
    expect(log.mock.calls.flat().join('\n')).not.toContain('AKIAIOSFODNN7EXAMPLE');
  });

  it('--json emits a parseable PASS report', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runManifest(fix('hello.pass.yaml'), { fromFixture: fix('pass'), json: true });
    const parsed = JSON.parse(log.mock.calls.flat().join(''));
    expect(parsed.tool).toBe('clawtest-hub');
    expect(parsed.verdict).toBe('PASS');
  });
});
