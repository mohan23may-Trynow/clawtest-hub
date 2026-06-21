import type { ExecScope, PostureSnapshot, Verdict } from './types.js';

export interface LayerResult {
  name: string;
  verdict: Verdict;
  summary: string;
  details: string[];
  /** An exact `openclaw` command the user can run to fix the problem, if applicable. */
  fix?: string;
}

export interface PostureResult {
  overall: Verdict;
  layers: LayerResult[];
}

/** Tools that can reach the host shell — dangerous if allowed without isolation. */
const DANGEROUS_TOOLS = ['exec', 'process', 'shell', 'bash', 'sh', 'run_command', 'terminal'];

const RANK: Record<Verdict, number> = { PASS: 0, WARN: 1, FAIL: 2 };

function worst(a: Verdict, b: Verdict): Verdict {
  return RANK[a] >= RANK[b] ? a : b;
}

export function evaluatePosture(snap: PostureSnapshot): PostureResult {
  const layers = [evaluateSandbox(snap), evaluateToolPolicy(snap), evaluateExecApprovals(snap)];
  const overall = layers.reduce<Verdict>((acc, l) => worst(acc, l.verdict), 'PASS');
  return { overall, layers };
}

function evaluateSandbox(snap: PostureSnapshot): LayerResult {
  const { mode, scope, workspaceAccess, sessionIsSandboxed } = snap.sandbox;
  const details: string[] = [
    `mode: ${mode}`,
    `scope: ${scope ?? 'unknown'}`,
    `workspaceAccess: ${workspaceAccess ?? 'unknown'}`,
    `sessionIsSandboxed: ${sessionIsSandboxed ?? 'unknown'}`,
  ];

  if (mode === 'off') {
    return {
      name: 'Sandboxing',
      verdict: 'FAIL',
      summary: 'Sandboxing is OFF — agent tools run directly on your host.',
      details,
      fix: 'openclaw config set agents.defaults.sandbox.mode non-main',
    };
  }

  if (mode !== 'non-main' && mode !== 'all') {
    return {
      name: 'Sandboxing',
      verdict: 'WARN',
      summary: `Could not confirm a safe sandbox mode (saw "${mode}").`,
      details,
      fix: 'openclaw config set agents.defaults.sandbox.mode non-main',
    };
  }

  let verdict: Verdict = 'PASS';
  const notes: string[] = [];
  if (workspaceAccess === 'rw') {
    verdict = worst(verdict, 'WARN');
    notes.push('host workspace is mounted read/write (rw) into the sandbox');
  }
  if (sessionIsSandboxed === false) {
    verdict = worst(verdict, 'WARN');
    notes.push('this session reports it is NOT sandboxed despite the mode');
  }

  return {
    name: 'Sandboxing',
    verdict,
    summary:
      verdict === 'PASS'
        ? `Sandboxed (mode: ${mode}). Tools run in an isolated environment.`
        : `Sandboxed (mode: ${mode}), but isolation is weakened.`,
    details: [...details, ...notes.map((n) => `! ${n}`)],
  };
}

function evaluateToolPolicy(snap: PostureSnapshot): LayerResult {
  const { allow, deny } = snap.toolPolicy;
  const sandboxOff = snap.sandbox.mode === 'off';
  const details = [
    `allow (${allow.length}): ${allow.length ? allow.join(', ') : '(none)'}`,
    `deny (${deny.length}): ${deny.length ? deny.join(', ') : '(none)'}`,
  ];

  const dangerousAllowed = allow.filter(
    (t) => DANGEROUS_TOOLS.includes(t.toLowerCase()) && !deny.includes(t),
  );

  if (dangerousAllowed.length > 0) {
    return {
      name: 'Tool policy',
      verdict: sandboxOff ? 'FAIL' : 'WARN',
      summary: sandboxOff
        ? `Host-reaching tools run on your host: ${dangerousAllowed.join(', ')}.`
        : `Host-reaching tools are allowed (contained by the sandbox): ${dangerousAllowed.join(', ')}.`,
      details,
      fix: `openclaw config set tools.sandbox.tools.deny '${JSON.stringify(dangerousAllowed)}'`,
    };
  }

  if (allow.length === 0 && deny.length === 0) {
    return {
      name: 'Tool policy',
      verdict: sandboxOff ? 'FAIL' : 'WARN',
      summary: 'No tool policy reported — every tool may be available to the agent.',
      details,
      fix: "openclaw config set tools.sandbox.tools.deny '[\"exec\",\"process\"]'",
    };
  }

  return {
    name: 'Tool policy',
    verdict: 'PASS',
    summary: 'No host-reaching tools are allowed (a denied tool cannot be re-enabled by /exec).',
    details,
  };
}

function findExecScope(scopes: ExecScope[]): ExecScope | undefined {
  return scopes.find((s) => s.label === 'tools.exec') ?? scopes[0];
}

function evaluateExecApprovals(snap: PostureSnapshot): LayerResult {
  const exec = findExecScope(snap.execPolicy.scopes);
  const { enabled, allowedByConfig } = snap.elevated;
  const details = [
    `approvals file exists: ${snap.execPolicy.approvalsExists}`,
    `exec mode: ${exec?.modeEffective ?? 'unknown'}`,
    `exec ask: ${exec?.askEffective ?? 'unknown'}`,
    `elevated.enabled: ${enabled}`,
    `elevated.allowedByConfig: ${allowedByConfig}`,
    'note: effective policy is the stricter of requested config and host-local approvals',
  ];

  const mode = exec?.modeEffective?.toLowerCase();
  const ask = exec?.askEffective?.toLowerCase();

  // Host exec can run AND it never prompts -> nothing stands between the agent and the host.
  const execCanRun = mode === 'full' || mode === 'restricted';
  const neverAsks = ask === 'off';

  if (execCanRun && neverAsks) {
    return {
      name: 'Exec approvals',
      verdict: 'FAIL',
      summary: 'Host exec can run without ever prompting — no human in the loop.',
      details,
      fix: 'openclaw exec-policy preset cautious',
    };
  }

  if (allowedByConfig) {
    return {
      name: 'Exec approvals',
      verdict: 'WARN',
      summary: 'Elevated host exec is allowed by config; verify approvals are intended.',
      details,
      fix: 'openclaw exec-policy preset cautious',
    };
  }

  return {
    name: 'Exec approvals',
    verdict: 'PASS',
    summary: 'Host exec requires explicit approval (or is disabled).',
    details,
  };
}
