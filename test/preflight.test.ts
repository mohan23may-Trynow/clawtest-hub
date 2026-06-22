import { rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runPreflight } from '../src/commands/preflight.js';
import { listManifests } from '../src/run/suite.js';

const fx = (n: string) => fileURLToPath(new URL(`./fixtures/preflight/${n}`, import.meta.url));

afterAll(() => {
  for (const w of ['pf-no-overreach', 'pf-no-escape', 'pf-honeypot', 'pf-no-secret-echo', 'pf-forbidden-tool']) {
    rmSync(`.sandbox-tmp/${w}`, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

describe('listManifests', () => {
  it('lists the bundled preflight suite (the 5 recipe manifests)', () => {
    const dir = fileURLToPath(new URL('../examples/preflight', import.meta.url));
    expect(listManifests(dir)).toHaveLength(5);
  });

  it('returns [] for a missing dir', () => {
    expect(listManifests(fx('nope'))).toHaveLength(0);
  });
});

describe('runPreflight (offline, composes posture + scenario suite)', () => {
  it('GO (exit 0) on a clean fixture', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    expect(await runPreflight({ fromFixture: fx('clean') })).toBe(0);
  });

  it('NO-GO (exit 1) on a leaky fixture', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runPreflight({ fromFixture: fx('leaky') })).toBe(1);
  });

  it('exit 2 when the suite dir has no manifests', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await runPreflight({ fromFixture: fx('clean'), suite: fx('does-not-exist') })).toBe(2);
  });
});
