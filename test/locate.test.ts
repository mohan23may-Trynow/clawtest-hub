import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { locateOpenclaw } from '../src/openclaw/locate.js';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'clawtest-locate-'));
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function writeConfig(obj: unknown): void {
  writeFileSync(join(dir, 'openclaw.json'), JSON.stringify(obj), 'utf8');
}

describe('locateOpenclaw', () => {
  it('uses defaults when there is no config', () => {
    const loc = locateOpenclaw({ stateDir: dir, env: {} });
    expect(loc.gatewayPort).toBe(18789);
    expect(loc.workspace).toBe(join(dir, 'workspace'));
    expect(loc.isRealWorkspace).toBe(true);
  });

  it('config workspace wins over the env override', () => {
    writeConfig({ agents: { defaults: { workspace: '/configured/ws' } }, gateway: { port: 9000 } });
    const loc = locateOpenclaw({ stateDir: dir, env: { OPENCLAW_WORKSPACE_DIR: '/env/ws' } });
    expect(loc.workspace).toBe('/configured/ws');
    expect(loc.gatewayPort).toBe(9000);
  });

  it('env override applies when config does not set a workspace, and is not the real workspace', () => {
    const loc = locateOpenclaw({ stateDir: dir, env: { OPENCLAW_WORKSPACE_DIR: '/env/ws' } });
    expect(loc.workspace).toBe('/env/ws');
    expect(loc.isRealWorkspace).toBe(false);
  });

  it('honors a non-default profile in the default workspace path', () => {
    const loc = locateOpenclaw({ stateDir: dir, env: { OPENCLAW_PROFILE: 'work' } });
    expect(loc.workspace).toBe(join(dir, 'workspace-work'));
  });

  it('never exposes the gateway token', () => {
    writeConfig({ gateway: { auth: { token: 'super-secret-token' } } });
    const loc = locateOpenclaw({ stateDir: dir, env: {} });
    expect(JSON.stringify(loc)).not.toContain('super-secret-token');
  });
});
