import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { parseApprovals, parseSandbox, parseToolPolicy } from '../src/posture/parse.js';

function fixture(name: string, file: string): string {
  return readFileSync(fileURLToPath(new URL(`./fixtures/${name}/${file}`, import.meta.url)), 'utf8');
}

describe('parseSandbox', () => {
  it('reads the default (unsafe) install', () => {
    const s = parseSandbox(fixture('unsafe', 'sandbox-explain.json'));
    expect(s.mode).toBe('off');
    expect(s.binds).toEqual([]);
  });

  it('reads docker.binds and network from either shape', () => {
    const s = parseSandbox(fixture('edge', 'sandbox-explain.json'));
    expect(s.mode).toBe('non-main');
    expect(s.workspaceAccess).toBe('rw');
    expect(s.binds).toEqual(['/home/user:/host:rw']);
  });

  it('defaults a missing mode to "unknown"', () => {
    expect(parseSandbox('{}').mode).toBe('unknown');
  });
});

describe('parseApprovals', () => {
  it('treats mode=auto as autoApprove even without the flag', () => {
    const a = parseApprovals('{"mode":"auto"}');
    expect(a.autoApprove).toBe(true);
  });

  it('reads explicit booleans', () => {
    const a = parseApprovals(fixture('edge', 'approvals-get.json'));
    expect(a.elevated).toBe(true);
    expect(a.autoApprove).toBe(true);
  });
});

describe('parseToolPolicy', () => {
  it('returns empty arrays when nothing is set', () => {
    const t = parseToolPolicy(fixture('unsafe', 'config-tools.json'));
    expect(t.allow).toEqual([]);
    expect(t.deny).toEqual([]);
  });

  it('reads allow/deny lists', () => {
    const t = parseToolPolicy(fixture('safe', 'config-tools.json'));
    expect(t.deny).toContain('exec');
  });
});
