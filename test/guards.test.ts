import { describe, expect, it } from 'vitest';
import { assertNotRealWorkspace, RealWorkspaceError } from '../src/safety/guards.js';
import type { OpenclawLocation } from '../src/openclaw/locate.js';

const base: OpenclawLocation = {
  stateDir: '/s',
  configPath: '/s/openclaw.json',
  configExists: false,
  workspace: '/s/workspace',
  gatewayPort: 18789,
  gatewayUrl: 'ws://127.0.0.1:18789',
  profile: 'default',
  isRealWorkspace: true,
};

describe('assertNotRealWorkspace', () => {
  it('throws on the real workspace', () => {
    expect(() => assertNotRealWorkspace(base)).toThrow(RealWorkspaceError);
  });

  it('allows a throwaway workspace', () => {
    expect(() =>
      assertNotRealWorkspace({ ...base, workspace: '/tmp/throwaway', isRealWorkspace: false }),
    ).not.toThrow();
  });
});
