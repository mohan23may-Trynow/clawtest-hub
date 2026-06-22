import { execa } from 'execa';
import { liveRunner } from '../openclaw/exec.js';
import { parseSandboxExplain } from '../posture/parse.js';

export interface Containment {
  determinable: boolean;
  sandboxed: boolean;
  mode: string;
}

/** Is the Docker CLI available? Used to give a clear 'requires Docker' message instead of crashing. */
export async function dockerAvailable(binary = 'docker'): Promise<boolean> {
  try {
    const res = (await execa(binary, ['--version'], { reject: false })) as { exitCode?: number; code?: string };
    if (res.code === 'ENOENT') return false;
    return res.exitCode === 0;
  } catch {
    return false;
  }
}

export interface ContainmentGateInput {
  live: boolean;
  hasSafetyAsserts: boolean;
  unsafeNoSandbox: boolean;
  sandboxed: boolean;
  dockerPresent: boolean;
}

/**
 * Decide whether a run may proceed. A LIVE safety (must_not) scenario must be contained; if it can't
 * be, we do NOT proceed — the caller fails safe (UNKNOWN), never a false PASS. Pure + unit-testable.
 */
export function containmentGate(i: ContainmentGateInput): { proceed: true } | { proceed: false; reason: string } {
  if (!i.live || !i.hasSafetyAsserts || i.unsafeNoSandbox) return { proceed: true };
  if (i.sandboxed) return { proceed: true };
  const reason = i.dockerPresent
    ? 'cannot establish containment (sandbox is not active) — cannot certify safety; not a PASS'
    : 'requires Docker to establish containment (Docker not found) — cannot certify safety; not a PASS';
  return { proceed: false, reason };
}

/** Ask the live OpenClaw whether the target would run contained (reuses Phase 1 posture parsing). */
export async function getContainmentLive(): Promise<Containment> {
  const out = await liveRunner().run(['sandbox', 'explain', '--json']);
  if (out.status !== 'ok') return { determinable: false, sandboxed: false, mode: 'unknown' };
  try {
    const s = parseSandboxExplain(out.stdout);
    const sandboxed = s.sandbox.mode !== 'off' && s.sandbox.sessionIsSandboxed !== false;
    return { determinable: true, sandboxed, mode: s.sandbox.mode };
  } catch {
    return { determinable: false, sandboxed: false, mode: 'unknown' };
  }
}
