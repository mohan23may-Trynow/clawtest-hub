import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPosture } from '../src/commands/posture.js';

function fixtureDir(name: string): string {
  return fileURLToPath(new URL(`./fixtures/${name}`, import.meta.url));
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('runPosture (end-to-end via fixtures)', () => {
  it('returns exit code 1 for the unsafe install and prints a FAIL', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runPosture({ fromFixture: fixtureDir('unsafe') });
    expect(code).toBe(1);
    expect(log.mock.calls.flat().join('\n')).toMatch(/FAIL/);
  });

  it('returns exit code 0 for the safe install', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runPosture({ fromFixture: fixtureDir('safe') });
    expect(code).toBe(0);
  });

  it('returns exit code 1 for the edge install (auto-approve)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runPosture({ fromFixture: fixtureDir('edge') });
    expect(code).toBe(1);
  });

  it('emits valid JSON with --json', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await runPosture({ fromFixture: fixtureDir('safe'), json: true });
    const out = log.mock.calls.flat().join('');
    const parsed = JSON.parse(out);
    expect(parsed.tool).toBe('clawtest-hub');
    expect(parsed.overall).toBe('PASS');
  });

  it('returns exit code 2 when a fixture is missing (stands in for openclaw unavailable)', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await runPosture({ fromFixture: fixtureDir('does-not-exist') });
    expect(code).toBe(2);
  });
});
