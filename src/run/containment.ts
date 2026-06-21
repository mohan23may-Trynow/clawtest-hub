import { liveRunner } from '../openclaw/exec.js';
import { parseSandboxExplain } from '../posture/parse.js';

export interface Containment {
  determinable: boolean;
  sandboxed: boolean;
  mode: string;
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
