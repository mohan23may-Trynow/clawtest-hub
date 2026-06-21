import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseExecPolicy, parseSandboxExplain } from '../src/posture/parse.js';

function fixture(name: string, file: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}/${file}`, import.meta.url)), 'utf8');
}

describe('parseSandboxExplain', () => {
  it('reads the real default (unsafe) install: mode off, exec allowed, elevated enabled', () => {
    const r = parseSandboxExplain(fixture('unsafe', 'sandbox-explain.json'));
    expect(r.sandbox.mode).toBe('off');
    expect(r.sandbox.sessionIsSandboxed).toBe(false);
    expect(r.toolPolicy.allow).toContain('exec');
    expect(r.elevated.enabled).toBe(true);
  });

  it('reads tool policy + sandbox flags from the safe fixture', () => {
    const r = parseSandboxExplain(fixture('safe', 'sandbox-explain.json'));
    expect(r.sandbox.mode).toBe('non-main');
    expect(r.sandbox.sessionIsSandboxed).toBe(true);
    expect(r.toolPolicy.deny).toContain('exec');
  });

  it('defaults missing fields safely', () => {
    const r = parseSandboxExplain('{}');
    expect(r.sandbox.mode).toBe('unknown');
    expect(r.toolPolicy.allow).toEqual([]);
    expect(r.elevated.enabled).toBe(false);
  });

  it('recovers JSON even when stderr noise leaks onto stdout', () => {
    const noisy = '[channels] failed to load bundled channel\n{"sandbox":{"mode":"all"}}';
    expect(parseSandboxExplain(noisy).sandbox.mode).toBe('all');
  });
});

describe('parseExecPolicy', () => {
  it('extracts effective values for the tools.exec scope', () => {
    const r = parseExecPolicy(fixture('unsafe', 'exec-policy-show.json'));
    const exec = r.scopes.find((s) => s.label === 'tools.exec');
    expect(exec?.modeEffective).toBe('full');
    expect(exec?.askEffective).toBe('off');
  });

  it('reads approvalsExists', () => {
    expect(parseExecPolicy(fixture('safe', 'exec-policy-show.json')).approvalsExists).toBe(true);
    expect(parseExecPolicy(fixture('unsafe', 'exec-policy-show.json')).approvalsExists).toBe(false);
  });
});
