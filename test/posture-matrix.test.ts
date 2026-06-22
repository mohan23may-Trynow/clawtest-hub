import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { runPosture } from '../src/commands/posture.js';
import { evaluatePosture } from '../src/posture/evaluate.js';
import type { PostureSnapshot } from '../src/posture/types.js';

const dir = (n: string) => fileURLToPath(new URL(`./fixtures/${n}`, import.meta.url));

afterEach(() => vi.restoreAllMocks());

interface Case {
  name: string;
  fixture: string;
  exit: number;
}

// Full state matrix driven end-to-end through runPosture (offline, via recorded fixtures).
const cases: Case[] = [
  { name: 'all-off (all FAIL)', fixture: 'unsafe', exit: 1 },
  { name: 'fully-locked (all PASS)', fixture: 'safe', exit: 0 },
  { name: 'mixed: sandbox on + rw + auto-approve (FAIL)', fixture: 'edge', exit: 1 },
  { name: 'mixed: sandboxed but tools open (WARN, still exit 0)', fixture: 'posture/tools-open', exit: 0 },
  { name: 'mixed: sandbox off, tools+approvals locked (FAIL — sandbox dominates)', fixture: 'posture/off-approvals-locked', exit: 1 },
  { name: 'mixed: sandboxed+tools locked but approvals open (FAIL)', fixture: 'posture/on-approvals-open', exit: 1 },
  { name: 'empty outputs (UNKNOWN — never PASS)', fixture: 'posture/empty', exit: 1 },
  { name: 'stderr-noise + valid locked JSON (PASS, recovered)', fixture: 'posture/noise', exit: 0 },
];

describe('posture pressure matrix (e2e)', () => {
  for (const c of cases) {
    it(`${c.name} -> exit ${c.exit}`, async () => {
      vi.spyOn(console, 'log').mockImplementation(() => {});
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const code = await runPosture({ fromFixture: dir(c.fixture) });
      expect(code).toBe(c.exit);
    });
  }

  it('malformed JSON -> exit 2 with a clear message (never PASS)', async () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const err = vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await runPosture({ fromFixture: dir('posture/malformed') });
    expect(code).toBe(2);
    expect(err.mock.calls.flat().join(' ')).toMatch(/could not understand/i);
  });

  it('missing fixture (stands in for no-OpenClaw) -> exit 2', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const code = await runPosture({ fromFixture: dir('posture/does-not-exist') });
    expect(code).toBe(2);
  });
});

describe('CARDINAL RULE: never report contained/PASS when data is missing or unexpected', () => {
  it('empty/unknown e2e never prints "contained" and is not exit 0', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const code = await runPosture({ fromFixture: dir('posture/empty') });
    const out = log.mock.calls.flat().join('\n');
    expect(code).not.toBe(0);
    expect(out).toMatch(/UNKN|could not determine|not a pass/i);
    expect(out).not.toMatch(/looks contained/i);
  });

  it('empty snapshot -> ALL three layers UNKNOWN (no layer may report WARN/PASS on absent data)', () => {
    const snap: PostureSnapshot = {
      sandbox: { mode: 'unknown' },
      toolPolicy: { allow: [], deny: [] },
      elevated: { enabled: false, allowedByConfig: false },
      execPolicy: { approvalsExists: false, scopes: [] },
    };
    const r = evaluatePosture(snap);
    expect(r.overall).toBe('UNKNOWN');
    expect(r.layers.find((l) => l.name === 'Sandboxing')?.verdict).toBe('UNKNOWN');
    expect(r.layers.find((l) => l.name === 'Tool policy')?.verdict).toBe('UNKNOWN');
    expect(r.layers.find((l) => l.name === 'Exec approvals')?.verdict).toBe('UNKNOWN');
    // No layer silently downgraded to WARN/PASS on missing data.
    expect(r.layers.every((l) => l.verdict === 'UNKNOWN')).toBe(true);
  });

  it('an unexpected sandbox mode is UNKNOWN, never PASS', () => {
    const snap: PostureSnapshot = {
      sandbox: { mode: 'banana', sessionIsSandboxed: true },
      toolPolicy: { allow: ['read'], deny: ['exec'] },
      elevated: { enabled: false, allowedByConfig: false },
      execPolicy: { approvalsExists: true, scopes: [{ label: 'tools.exec', modeEffective: 'off', askEffective: 'on' }] },
    };
    const r = evaluatePosture(snap);
    expect(r.layers.find((l) => l.name === 'Sandboxing')?.verdict).toBe('UNKNOWN');
    expect(r.overall).not.toBe('PASS');
  });
});
