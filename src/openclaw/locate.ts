import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

export interface OpenclawLocation {
  stateDir: string;
  configPath: string;
  configExists: boolean;
  workspace: string;
  gatewayPort: number;
  gatewayUrl: string;
  profile: string;
  /** True if the resolved workspace is the agent's real workspace (default or configured). */
  isRealWorkspace: boolean;
}

const DEFAULT_PORT = 18789;

/**
 * Resolve where OpenClaw keeps its state, config, workspace, and gateway port.
 * Mirrors the precedence documented in INTEGRATION_NOTES.md. The gateway token
 * (gateway.auth.token) is deliberately NEVER read into the return value.
 */
export function locateOpenclaw(
  opts: { stateDir?: string; env?: NodeJS.ProcessEnv } = {},
): OpenclawLocation {
  const env = opts.env ?? process.env;
  const home = homedir();

  const stateDir = opts.stateDir ?? env.OPENCLAW_STATE_DIR ?? join(home, '.openclaw');
  const configPath = join(stateDir, 'openclaw.json');
  const configExists = existsSync(configPath);

  const config = configExists ? readConfig(configPath) : {};

  const rawProfile = env.OPENCLAW_PROFILE;
  const profile = rawProfile && rawProfile !== 'default' ? rawProfile : 'default';

  // workspace precedence: explicit config value > OPENCLAW_WORKSPACE_DIR > default.
  const configuredWorkspace = getString(config, ['agents', 'defaults', 'workspace']);
  const defaultWorkspace =
    profile === 'default'
      ? join(stateDir, 'workspace')
      : join(stateDir, `workspace-${profile}`);
  const envWorkspace = env.OPENCLAW_WORKSPACE_DIR;
  const workspace = configuredWorkspace ?? envWorkspace ?? defaultWorkspace;

  // The agent's "real" workspace is whatever it actually uses absent an env override.
  const realWorkspace = configuredWorkspace ?? defaultWorkspace;
  const isRealWorkspace = workspace === realWorkspace;

  const configuredPort = getNumber(config, ['gateway', 'port']);
  const envPort = env.OPENCLAW_GATEWAY_PORT ? Number(env.OPENCLAW_GATEWAY_PORT) : undefined;
  const gatewayPort =
    configuredPort ?? (envPort && Number.isFinite(envPort) ? envPort : undefined) ?? DEFAULT_PORT;
  const gatewayUrl = `ws://127.0.0.1:${gatewayPort}`;

  return {
    stateDir,
    configPath,
    configExists,
    workspace,
    gatewayPort,
    gatewayUrl,
    profile,
    isRealWorkspace,
  };
}

function readConfig(path: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function dig(obj: unknown, path: string[]): unknown {
  let cur: unknown = obj;
  for (const key of path) {
    if (typeof cur !== 'object' || cur === null) return undefined;
    cur = (cur as Record<string, unknown>)[key];
  }
  return cur;
}

function getString(obj: unknown, path: string[]): string | undefined {
  const v = dig(obj, path);
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

function getNumber(obj: unknown, path: string[]): number | undefined {
  const v = dig(obj, path);
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
