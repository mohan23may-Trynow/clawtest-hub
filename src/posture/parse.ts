import {
  ApprovalsRaw,
  SandboxRaw,
  ToolsRaw,
  type ApprovalsLayer,
  type SandboxLayer,
  type ToolPolicyLayer,
} from './types.js';

function asJson(stdout: string): unknown {
  return JSON.parse(stdout);
}

/** Normalize `openclaw sandbox explain --json` output. */
export function parseSandbox(stdout: string): SandboxLayer {
  const raw = SandboxRaw.parse(asJson(stdout));
  const binds = raw.binds ?? raw.docker?.binds ?? [];
  return {
    mode: raw.mode ?? 'unknown',
    workspaceAccess: raw.workspaceAccess,
    scope: raw.scope,
    backend: raw.backend,
    network: raw.network ?? raw.docker?.network,
    binds,
  };
}

/** Normalize `openclaw approvals get --json` output. */
export function parseApprovals(stdout: string): ApprovalsLayer {
  const raw = ApprovalsRaw.parse(asJson(stdout));
  const mode = raw.mode?.toLowerCase();
  const elevated = raw.elevated ?? mode === 'elevated';
  const autoApprove = raw.autoApprove ?? mode === 'auto';
  return { mode: raw.mode, elevated, autoApprove };
}

/** Normalize `openclaw config get tools --json` output. */
export function parseToolPolicy(stdout: string): ToolPolicyLayer {
  const raw = ToolsRaw.parse(asJson(stdout));
  return {
    allow: raw.allow ?? [],
    deny: raw.deny ?? [],
  };
}
