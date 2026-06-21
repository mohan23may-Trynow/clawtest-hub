import { describe, expect, it } from 'vitest';
import { evaluatePosture, type PostureResult } from '../src/posture/evaluate.js';
import type { PostureSnapshot } from '../src/posture/types.js';

function layer(result: PostureResult, name: string) {
  const l = result.layers.find((x) => x.name === name);
  if (!l) throw new Error(`missing layer ${name}`);
  return l;
}

const safe: PostureSnapshot = {
  sandbox: { mode: 'non-main', workspaceAccess: 'none', backend: 'docker', network: 'none', binds: [] },
  toolPolicy: { allow: ['read_file'], deny: ['exec', 'shell'] },
  approvals: { mode: 'prompt', elevated: false, autoApprove: false },
};

describe('evaluatePosture', () => {
  it('passes a well-configured posture', () => {
    const r = evaluatePosture(safe);
    expect(r.overall).toBe('PASS');
    expect(layer(r, 'Sandboxing').verdict).toBe('PASS');
    expect(layer(r, 'Tool policy').verdict).toBe('PASS');
    expect(layer(r, 'Exec approvals').verdict).toBe('PASS');
  });

  it('FAILs when sandboxing is off and includes a fix command', () => {
    const r = evaluatePosture({ ...safe, sandbox: { ...safe.sandbox, mode: 'off' } });
    expect(r.overall).toBe('FAIL');
    const s = layer(r, 'Sandboxing');
    expect(s.verdict).toBe('FAIL');
    expect(s.fix).toContain('sandbox.mode');
  });

  it('FAILs the tool layer when unrestricted AND sandbox off', () => {
    const r = evaluatePosture({
      sandbox: { ...safe.sandbox, mode: 'off' },
      toolPolicy: { allow: [], deny: [] },
      approvals: safe.approvals,
    });
    expect(layer(r, 'Tool policy').verdict).toBe('FAIL');
  });

  it('only WARNs on an unrestricted tool policy when a sandbox is present', () => {
    const r = evaluatePosture({ ...safe, toolPolicy: { allow: [], deny: [] } });
    expect(layer(r, 'Tool policy').verdict).toBe('WARN');
  });

  it('WARNs the sandbox layer on rw access and piercing binds', () => {
    const r = evaluatePosture({
      ...safe,
      sandbox: { mode: 'non-main', workspaceAccess: 'rw', backend: 'docker', network: 'none', binds: ['/h:/c:rw'] },
    });
    expect(layer(r, 'Sandboxing').verdict).toBe('WARN');
  });

  it('FAILs exec approvals when auto-approve is on', () => {
    const r = evaluatePosture({ ...safe, approvals: { mode: 'auto', elevated: true, autoApprove: true } });
    expect(r.overall).toBe('FAIL');
    expect(layer(r, 'Exec approvals').verdict).toBe('FAIL');
  });

  it('overall verdict is the worst layer', () => {
    const r = evaluatePosture({ ...safe, approvals: { mode: 'auto', elevated: true, autoApprove: true } });
    expect(r.overall).toBe('FAIL');
  });
});
