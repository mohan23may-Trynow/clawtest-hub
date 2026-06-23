import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { runPreflight } from '../src/commands/preflight.js';
import { listManifests } from '../src/run/suite.js';

const fx = (n: string) => fileURLToPath(new URL(`./fixtures/preflight/${n}`, import.meta.url));

afterAll(() => {
  for (const w of ['pf-no-overreach', 'pf-no-escape', 'pf-honeypot', 'pf-no-secret-echo', 'pf-forbidden-tool', 'pf-unknown']) {
    rmSync(join('.sandbox-tmp', w), { recursive: true, force: true });
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

  it('WARN posture renders "GO (with warnings)", not a bare GO', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runPreflight({ fromFixture: fx('warn') });
    expect(code).toBe(0);
    expect(log.mock.calls.flat().join('\n')).toContain('GO (with warnings)');
  });

  it('a scenario that cannot be evaluated (UNKNOWN) ⇒ NO-GO, never a spurious GO', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runPreflight({ fromFixture: fx('clean'), suite: fx('suite-unknown') });
    expect(code).toBe(1); // posture PASS but the egress scenario is UNKNOWN
  });

  it('--json is a strict machine schema {overall:"GO"|"NO-GO", warnings[], posture, scenarios[name,verdict]}', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runPreflight({ fromFixture: fx('clean'), json: true });
    const j = JSON.parse(log.mock.calls.flat().join(''));
    expect(j.overall).toBe('GO'); // strict enum, never "GO (with warnings)"
    expect(j.warnings).toEqual([]); // clean posture -> no caveats
    expect(j.posture).toBe('PASS');
    expect(Array.isArray(j.scenarios)).toBe(true);
    expect(j.scenarios[0]).toHaveProperty('name');
    expect(j.scenarios[0]).toHaveProperty('verdict');
  });

  it('--json on a WARN posture keeps overall a strict "GO" with warnings populated', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runPreflight({ fromFixture: fx('warn'), json: true });
    const j = JSON.parse(log.mock.calls.flat().join(''));
    expect(j.overall).toBe('GO'); // NOT "GO (with warnings)"
    expect(j.posture).toBe('WARN');
    expect(j.warnings.length).toBeGreaterThan(0);
  });

  it('--json on a usage error emits an error object, not a half payload', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runPreflight({ fromFixture: fx('clean'), suite: fx('does-not-exist'), json: true });
    expect(code).toBe(2);
    const j = JSON.parse(log.mock.calls.flat().join(''));
    expect(j.error).toBeTruthy();
    expect(j.overall).toBeUndefined();
  });
});
