import { describe, expect, it } from 'vitest';
import { evaluatePosture, type PostureResult } from '../src/posture/evaluate.js';
import type { PostureSnapshot } from '../src/posture/types.js';

function layer(result: PostureResult, name: string) {
  const l = result.layers.find((x) => x.name === name);
  if (!l) throw new Error(`missing layer ${name}`);
  return l;
}

const safe: PostureSnapshot = {
  sandbox: { mode: 'non-main', scope: 'session', workspaceAccess: 'none', sessionIsSandboxed: true },
  toolPolicy: { allow: ['read', 'write'], deny: ['exec', 'process'] },
  elevated: { enabled: false, allowedByConfig: false },
  execPolicy: {
    approvalsExists: true,
    scopes: [{ label: 'tools.exec', modeEffective: 'off', askEffective: 'on', securityEffective: 'restricted' }],
  },
};

describe('evaluatePosture', () => {
  it('passes a well-configured posture', () => {
    const r = evaluatePosture(safe);
    expect(r.overall).toBe('PASS');
    expect(layer(r, 'Sandboxing').verdict).toBe('PASS');
    expect(layer(r, 'Tool policy').verdict).toBe('PASS');
    expect(layer(r, 'Exec approvals').verdict).toBe('PASS');
  });

  it('FAILs when sandboxing is off, with a fix command', () => {
    const r = evaluatePosture({ ...safe, sandbox: { ...safe.sandbox, mode: 'off' } });
    expect(layer(r, 'Sandboxing').verdict).toBe('FAIL');
    expect(layer(r, 'Sandboxing').fix).toContain('sandbox.mode');
  });

  it('FAILs tool policy when exec is allowed AND sandbox is off', () => {
    const r = evaluatePosture({
      ...safe,
      sandbox: { ...safe.sandbox, mode: 'off' },
      toolPolicy: { allow: ['exec', 'read'], deny: [] },
    });
    expect(layer(r, 'Tool policy').verdict).toBe('FAIL');
  });

  it('only WARNs tool policy when exec is allowed but contained by a sandbox', () => {
    const r = evaluatePosture({ ...safe, toolPolicy: { allow: ['exec', 'read'], deny: [] } });
    expect(layer(r, 'Tool policy').verdict).toBe('WARN');
  });

  it('WARNs the sandbox layer on rw workspace access', () => {
    const r = evaluatePosture({ ...safe, sandbox: { ...safe.sandbox, workspaceAccess: 'rw' } });
    expect(layer(r, 'Sandboxing').verdict).toBe('WARN');
  });

  it('FAILs exec approvals when exec can run and never prompts', () => {
    const r = evaluatePosture({
      ...safe,
      execPolicy: { approvalsExists: false, scopes: [{ label: 'tools.exec', modeEffective: 'full', askEffective: 'off' }] },
    });
    expect(layer(r, 'Exec approvals').verdict).toBe('FAIL');
    expect(r.overall).toBe('FAIL');
  });

  it('WARNs exec approvals when elevated is allowed by config but exec still prompts', () => {
    const r = evaluatePosture({ ...safe, elevated: { enabled: true, allowedByConfig: true } });
    expect(layer(r, 'Exec approvals').verdict).toBe('WARN');
  });

  it('matches the real default install: all three layers FAIL', () => {
    const realDefault: PostureSnapshot = {
      sandbox: { mode: 'off', scope: 'agent', workspaceAccess: 'none', sessionIsSandboxed: false },
      toolPolicy: { allow: ['exec', 'process', 'read'], deny: ['browser'] },
      elevated: { enabled: true, allowedByConfig: false },
      execPolicy: { approvalsExists: false, scopes: [{ label: 'tools.exec', modeEffective: 'full', askEffective: 'off' }] },
    };
    const r = evaluatePosture(realDefault);
    expect(r.overall).toBe('FAIL');
    expect(r.layers.every((l) => l.verdict === 'FAIL')).toBe(true);
  });
});
