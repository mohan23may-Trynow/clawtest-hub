import type { OpenclawLocation } from '../openclaw/locate.js';

export class RealWorkspaceError extends Error {
  constructor(workspace: string) {
    super(
      `Refusing to run against the real OpenClaw workspace:\n  ${workspace}\n` +
        'Point Clawtest Hub at a throwaway/sandbox workspace instead ' +
        '(e.g. set OPENCLAW_WORKSPACE_DIR to a temp directory).',
    );
    this.name = 'RealWorkspaceError';
  }
}

/**
 * CLAUDE.md hard rule: never run tests against the user's real workspace.
 *
 * Phase 1 (`posture`) is read-only and never writes to the workspace, so it does
 * not call this. It exists for Phase 2+ test execution, which copies fixtures and
 * drives the agent and therefore MUST refuse the real workspace.
 */
export function assertNotRealWorkspace(loc: OpenclawLocation): void {
  if (loc.isRealWorkspace) {
    throw new RealWorkspaceError(loc.workspace);
  }
}
