import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import type { AgentTurnResult } from '../openclaw/agent.js';

export interface ToolCallObserved {
  name: string;
  args: Record<string, unknown>;
}

export interface ObservedRun {
  /** The agent's emitted reply text (meta payloads) — scanned for leaked secrets. */
  outputText: string[];
  /** Tool names from meta.toolSummary — determinable whenever the turn ran. */
  toolsCalled: string[];
  /** Per-call detail from the trajectory (args incl. paths) — only if trajectory present. */
  toolCalls: ToolCallObserved[];
  reads: string[];
  writes: string[];
  /** Command strings from exec/process/shell tool calls — scanned for shell-based path access. */
  execCommands: string[];
  trajectoryAvailable: boolean;
  workspace: string;
  filesInWorkspace: string[];
}

const READ_TOOLS = new Set(['read']);
const WRITE_TOOLS = new Set(['write', 'edit', 'apply_patch']);
const EXEC_TOOLS = new Set(['exec', 'process', 'shell', 'bash', 'sh']);

function commandArg(c: ToolCallObserved): string | undefined {
  const v = c.args.command ?? c.args.cmd ?? c.args.script ?? c.args.args;
  if (typeof v === 'string') return v;
  if (Array.isArray(v)) return v.map(String).join(' ');
  return undefined;
}

/** Recursively collect `{type:"toolCall", name, arguments}` nodes from a parsed trajectory line. */
function collectToolCalls(node: unknown, out: ToolCallObserved[]): void {
  if (Array.isArray(node)) {
    for (const item of node) collectToolCalls(item, out);
    return;
  }
  if (node && typeof node === 'object') {
    const obj = node as Record<string, unknown>;
    if (obj.type === 'toolCall' && typeof obj.name === 'string') {
      const args = obj.arguments && typeof obj.arguments === 'object' ? (obj.arguments as Record<string, unknown>) : {};
      out.push({ name: obj.name, args });
    }
    for (const v of Object.values(obj)) collectToolCalls(v, out);
  }
}

export function parseTrajectory(path: string): ToolCallObserved[] {
  const out: ToolCallObserved[] = [];
  const text = readFileSync(path, 'utf8');
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    try {
      collectToolCalls(JSON.parse(t), out);
    } catch {
      // skip unparseable lines
    }
  }
  return out;
}

function listFiles(dir: string, base = dir): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else out.push(relative(base, full).replace(/\\/g, '/'));
  }
  return out;
}

function pathArg(c: ToolCallObserved): string | undefined {
  const p = c.args.path ?? c.args.file_path ?? c.args.file;
  return typeof p === 'string' ? p : undefined;
}

export function observeRun(result: AgentTurnResult, workspace: string): ObservedRun {
  const toolCalls: ToolCallObserved[] = [];
  let trajectoryAvailable = false;
  if (result.trajectoryPath && existsSync(result.trajectoryPath)) {
    trajectoryAvailable = true;
    toolCalls.push(...parseTrajectory(result.trajectoryPath));
  }
  const reads = toolCalls.filter((c) => READ_TOOLS.has(c.name)).map(pathArg).filter((p): p is string => !!p);
  const writes = toolCalls.filter((c) => WRITE_TOOLS.has(c.name)).map(pathArg).filter((p): p is string => !!p);
  const execCommands = toolCalls.filter((c) => EXEC_TOOLS.has(c.name)).map(commandArg).filter((p): p is string => !!p);
  return {
    outputText: result.payloads,
    toolsCalled: result.toolSummary.tools,
    toolCalls,
    reads,
    writes,
    execCommands,
    trajectoryAvailable,
    workspace,
    filesInWorkspace: listFiles(workspace),
  };
}
