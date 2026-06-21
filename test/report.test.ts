import { describe, expect, it } from 'vitest';
import { evaluatePosture } from '../src/posture/evaluate.js';
import { buildJsonReport, exitCodeFor, renderHuman } from '../src/report/render.js';
import type { OpenclawLocation } from '../src/openclaw/locate.js';
import type { PostureSnapshot } from '../src/posture/types.js';

const loc: OpenclawLocation = {
  stateDir: '/home/u/.openclaw',
  configPath: '/home/u/.openclaw/openclaw.json',
  configExists: true,
  workspace: '/home/u/.openclaw/workspace',
  gatewayPort: 18789,
  gatewayUrl: 'ws://127.0.0.1:18789',
  profile: 'default',
  isRealWorkspace: true,
};

const failSnap: PostureSnapshot = {
  sandbox: { mode: 'off', scope: 'agent', workspaceAccess: 'none', sessionIsSandboxed: false },
  toolPolicy: { allow: ['exec', 'process'], deny: [] },
  elevated: { enabled: true, allowedByConfig: false },
  execPolicy: { approvalsExists: false, scopes: [{ label: 'tools.exec', modeEffective: 'full', askEffective: 'off' }] },
};

const passSnap: PostureSnapshot = {
  sandbox: { mode: 'non-main', scope: 'session', workspaceAccess: 'none', sessionIsSandboxed: true },
  toolPolicy: { allow: ['read'], deny: ['exec', 'process'] },
  elevated: { enabled: false, allowedByConfig: false },
  execPolicy: { approvalsExists: true, scopes: [{ label: 'tools.exec', modeEffective: 'off', askEffective: 'on' }] },
};

describe('report', () => {
  it('exit code is 1 on FAIL and 0 on PASS', () => {
    expect(exitCodeFor(evaluatePosture(failSnap))).toBe(1);
    expect(exitCodeFor(evaluatePosture(passSnap))).toBe(0);
  });

  it('buildJsonReport has a stable shape', () => {
    const json = buildJsonReport(loc, evaluatePosture(failSnap), failSnap, '2026-06-21T00:00:00.000Z');
    expect(json.tool).toBe('clawtest-hub');
    expect(json.overall).toBe('FAIL');
    expect(json.layers).toHaveLength(3);
    expect(json.generatedAt).toBe('2026-06-21T00:00:00.000Z');
    expect(json.target.workspace).toBe('/home/u/.openclaw/workspace');
  });

  it('human report shows verdicts and the fix command, and never leaks a token', () => {
    const text = renderHuman(loc, evaluatePosture(failSnap), failSnap);
    expect(text).toContain('OVERALL');
    expect(text).toContain('sandbox.mode');
    expect(text).not.toContain('token');
  });
});
