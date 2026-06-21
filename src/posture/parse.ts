import {
  ExecPolicyShowRaw,
  SandboxExplainRaw,
  type ElevatedInfo,
  type ExecPolicyLayer,
  type SandboxLayer,
  type ToolPolicyLayer,
} from './types.js';

/**
 * Parse JSON from an `openclaw ... --json` command. OpenClaw prints benign
 * warnings (e.g. "[channels] failed to load ...") to stderr, but if any noise
 * leaks onto stdout we still recover the JSON object by slicing to its braces.
 */
function asJson(stdout: string): unknown {
  const trimmed = stdout.trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const start = trimmed.indexOf('{');
    const end = trimmed.lastIndexOf('}');
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1));
    }
    throw new Error('no JSON object found in command output');
  }
}

export interface SandboxExplainResult {
  sandbox: SandboxLayer;
  toolPolicy: ToolPolicyLayer;
  elevated: ElevatedInfo;
}

/** Normalize `openclaw sandbox explain --json` (sandbox + tool policy + elevation). */
export function parseSandboxExplain(stdout: string): SandboxExplainResult {
  const raw = SandboxExplainRaw.parse(asJson(stdout));
  const sb = raw.sandbox ?? {};
  return {
    sandbox: {
      mode: sb.mode ?? 'unknown',
      scope: sb.scope,
      workspaceAccess: sb.workspaceAccess,
      sessionIsSandboxed: sb.sessionIsSandboxed,
    },
    toolPolicy: {
      allow: sb.tools?.allow ?? [],
      deny: sb.tools?.deny ?? [],
    },
    elevated: {
      enabled: raw.elevated?.enabled ?? false,
      allowedByConfig: raw.elevated?.allowedByConfig ?? false,
    },
  };
}

/** Normalize `openclaw exec-policy show --json`. */
export function parseExecPolicy(stdout: string): ExecPolicyLayer {
  const raw = ExecPolicyShowRaw.parse(asJson(stdout));
  const scopes = (raw.effectivePolicy?.scopes ?? []).map((s) => ({
    label: s.scopeLabel ?? 'unknown',
    modeEffective: s.mode?.effective,
    askEffective: s.ask?.effective,
    securityEffective: s.security?.effective,
    hostRequested: s.host?.requested,
  }));
  return {
    approvalsExists: raw.approvalsExists ?? false,
    scopes,
  };
}
