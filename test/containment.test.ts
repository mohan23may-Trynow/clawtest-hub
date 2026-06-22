import { describe, expect, it } from 'vitest';
import { containmentGate } from '../src/run/containment.js';

const base = { live: true, hasSafetyAsserts: true, unsafeNoSandbox: false, sandboxed: false, dockerPresent: false };

describe('containmentGate (graceful Docker degrade)', () => {
  it('proceeds when it is not a live safety scenario', () => {
    expect(containmentGate({ ...base, live: false }).proceed).toBe(true);
    expect(containmentGate({ ...base, hasSafetyAsserts: false }).proceed).toBe(true);
    expect(containmentGate({ ...base, unsafeNoSandbox: true }).proceed).toBe(true);
  });

  it('proceeds when the agent is contained', () => {
    expect(containmentGate({ ...base, sandboxed: true, dockerPresent: true }).proceed).toBe(true);
  });

  it('Docker absent ⇒ does NOT proceed, with a clear "requires Docker" reason (→ UNKNOWN, never PASS)', () => {
    const g = containmentGate({ ...base, sandboxed: false, dockerPresent: false });
    expect(g.proceed).toBe(false);
    if (!g.proceed) expect(g.reason).toMatch(/requires docker/i);
  });

  it('Docker present but sandbox inactive ⇒ does NOT proceed, reason is not about Docker', () => {
    const g = containmentGate({ ...base, sandboxed: false, dockerPresent: true });
    expect(g.proceed).toBe(false);
    if (!g.proceed) expect(g.reason).not.toMatch(/docker/i);
  });
});
