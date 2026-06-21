import { cpSync, existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';

export interface ToolSummary {
  calls: number;
  tools: string[];
  failures: number;
}

export interface AgentTurnResult {
  ok: true;
  payloads: string[];
  aborted: boolean;
  timeoutPhase?: string;
  toolSummary: ToolSummary;
  usage?: { input: number; output: number; total: number };
  sessionFile?: string;
  /** Sibling `<session>.trajectory.jsonl` if derivable/present — holds per-call tool args. */
  trajectoryPath?: string;
  raw: unknown;
}

export type AgentFailureReason = 'not-installed' | 'no-model' | 'gateway-not-onboarded' | 'error';

export type AgentOutcome =
  | AgentTurnResult
  | { ok: false; reason: AgentFailureReason; message: string };

export interface AgentRunOpts {
  agent: string;
  message: string;
  timeoutSec?: number;
  /** Throwaway workspace the run targets (fixture driver copies produced files here). */
  workspace?: string;
}

export interface AgentDriver {
  run(opts: AgentRunOpts): Promise<AgentOutcome>;
}

function extractJson(stdout: string): unknown {
  const t = stdout.trim();
  try {
    return JSON.parse(t);
  } catch {
    const a = t.indexOf('{');
    const b = t.lastIndexOf('}');
    if (a >= 0 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('no JSON object in agent output');
  }
}

function toTrajectoryPath(sessionFile?: string): string | undefined {
  if (!sessionFile) return undefined;
  const traj = sessionFile.replace(/\.jsonl$/i, '.trajectory.jsonl');
  return existsSync(traj) ? traj : undefined;
}

function shapeResult(raw: any): AgentTurnResult {
  const meta = raw?.meta ?? {};
  const ts = meta.toolSummary ?? {};
  const sessionFile = meta.agentMeta?.sessionFile as string | undefined;
  return {
    ok: true,
    payloads: Array.isArray(raw?.payloads)
      ? raw.payloads.map((p: any) => String(p?.text ?? '')).filter(Boolean)
      : [],
    aborted: meta.aborted === true,
    timeoutPhase: meta.timeoutPhase,
    toolSummary: {
      calls: typeof ts.calls === 'number' ? ts.calls : 0,
      tools: Array.isArray(ts.tools) ? ts.tools.map(String) : [],
      failures: typeof ts.failures === 'number' ? ts.failures : 0,
    },
    usage: meta.agentMeta?.usage,
    sessionFile,
    trajectoryPath: toTrajectoryPath(sessionFile),
    raw,
  };
}

/** Drives the real `openclaw agent` CLI (which performs the gateway handshake / runs Ollama via --local). */
export function liveAgentDriver(binary = 'openclaw'): AgentDriver {
  return {
    async run(opts: AgentRunOpts): Promise<AgentOutcome> {
      const args = [
        'agent',
        '--json',
        '--local',
        '--agent',
        opts.agent,
        '--message',
        opts.message,
        '--timeout',
        String(opts.timeoutSec ?? 300),
      ];
      let res: { exitCode?: number; stdout?: string; stderr?: string; code?: string };
      try {
        res = (await execa(binary, args, { reject: false })) as typeof res;
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') return notInstalled();
        return { ok: false, reason: 'error', message: e.message };
      }
      if (res.code === 'ENOENT') return notInstalled();
      const stderr = (res.stderr ?? '').toLowerCase();
      if (res.exitCode !== 0) {
        if (stderr.includes('not recognized') || stderr.includes('command not found')) return notInstalled();
        if (stderr.includes('providerautherror') || stderr.includes('missing-provider-auth') || stderr.includes('no api key'))
          return { ok: false, reason: 'no-model', message: 'No model provider auth (set OLLAMA_API_KEY and configure a model).' };
        if (stderr.includes('gatewaycredentialsrequirederror') || stderr.includes('requires credentials'))
          return { ok: false, reason: 'gateway-not-onboarded', message: 'Gateway needs credentials (run openclaw onboard) or use --local.' };
        return { ok: false, reason: 'error', message: `openclaw agent exited ${res.exitCode}: ${(res.stderr ?? '').trim().slice(0, 300)}` };
      }
      try {
        return shapeResult(extractJson(res.stdout ?? ''));
      } catch (err) {
        return { ok: false, reason: 'error', message: `Could not parse agent --json: ${err instanceof Error ? err.message : String(err)}` };
      }
    },
  };
}

/**
 * Reads a recorded scenario from <dir>: `agent.json` (the --json envelope), optional
 * `trajectory.jsonl` (tool-call args), and optional `produced/` files copied into the workspace
 * to simulate the agent's side-effects. Lets the runner be built + tested fully offline.
 */
export function fixtureAgentDriver(dir: string): AgentDriver {
  return {
    async run(opts: AgentRunOpts): Promise<AgentOutcome> {
      const envelopePath = join(dir, 'agent.json');
      if (!existsSync(envelopePath)) {
        return { ok: false, reason: 'error', message: `fixture missing agent.json: ${envelopePath}` };
      }
      const produced = join(dir, 'produced');
      if (opts.workspace && existsSync(produced)) {
        cpSync(produced, opts.workspace, { recursive: true });
      }
      let raw: unknown;
      try {
        raw = JSON.parse(readFileSync(envelopePath, 'utf8'));
      } catch (err) {
        return { ok: false, reason: 'error', message: `fixture agent.json invalid: ${err instanceof Error ? err.message : String(err)}` };
      }
      const result = shapeResult(raw);
      const traj = join(dir, 'trajectory.jsonl');
      result.trajectoryPath = existsSync(traj) ? traj : undefined;
      return result;
    },
  };
}

function notInstalled(): AgentOutcome {
  return {
    ok: false,
    reason: 'not-installed',
    message: 'The `openclaw` CLI was not found. Install OpenClaw, or use --from-fixture <dir>.',
  };
}
