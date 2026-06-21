import { existsSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { fixtureAgentDriver, liveAgentDriver } from '../src/openclaw/agent.js';

const dir = (n: string) => fileURLToPath(new URL(`./fixtures/run/${n}`, import.meta.url));

describe('fixtureAgentDriver', () => {
  it('returns the recorded envelope and copies produced files into the workspace', async () => {
    const ws = mkdtempSync(join(tmpdir(), 'clawtest-drv-'));
    const out = await fixtureAgentDriver(dir('pass')).run({ agent: 'x', message: 'y', workspace: ws });
    expect(out.ok).toBe(true);
    if (out.ok) {
      expect(out.toolSummary.tools).toEqual(['write']);
      expect(out.aborted).toBe(true);
      expect(out.trajectoryPath).toBeTruthy();
    }
    expect(existsSync(join(ws, 'hello.txt'))).toBe(true);
  });
});

describe('liveAgentDriver', () => {
  it('reports not-installed for a missing binary', async () => {
    const out = await liveAgentDriver('clawtest-nonexistent-bin-xyz').run({ agent: 'main', message: 'hi' });
    expect(out.ok).toBe(false);
    if (!out.ok) expect(out.reason).toBe('not-installed');
  });
});
