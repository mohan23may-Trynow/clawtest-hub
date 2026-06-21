import type { PostureSnapshot, Verdict } from './types.js';

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
const DANGEROUS_TOOLS = ['exec', 'shell', 'bash', 'sh', 'process', 'run_command', 'terminal'];

const RANK: Record<Verdict, number> = { PASS: 0, WARN: 1, FAIL: 2 };

function worst(a: Verdict, b: Verdict): Verdict {
  return RANK[a] >= RANK[b] ? a : b;
}

export function evaluatePosture(snap: PostureSnapshot): PostureResult {
  const sandbox = evaluateSandbox(snap);
  const toolPolicy = evaluateToolPolicy(snap);
  const approvals = evaluateApprovals(snap);
  const layers = [sandbox, toolPolicy, approvals];
  const overall = layers.reduce<Verdict>((acc, l) => worst(acc, l.verdict), 'PASS');
  return { overall, layers };
}

function evaluateSandbox(snap: PostureSnapshot): LayerResult {
  const { mode, workspaceAccess, scope, backend, network, binds } = snap.sandbox;
  const details: string[] = [
    `mode: ${mode}`,
    `workspaceAccess: ${workspaceAccess ?? 'unknown'}`,
    `scope: ${scope ?? 'unknown'}`,
    `backend: ${backend ?? 'unknown'}`,
    `network: ${network ?? 'unknown'}`,
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

  // mode is non-main or all: start from PASS and downgrade on weakening factors.
  let verdict: Verdict = 'PASS';
  const notes: string[] = [];

  if (workspaceAccess === 'rw') {
    verdict = worst(verdict, 'WARN');
    notes.push('host workspace is mounted read/write (rw) into the sandbox');
  }
  if (binds.length > 0) {
    verdict = worst(verdict, 'WARN');
    notes.push(`docker.binds mount host paths into the sandbox (pierces isolation): ${binds.join(', ')}`);
  }
  if ((network ?? '').toLowerCase() === 'host') {
    verdict = worst(verdict, 'FAIL');
    notes.push('container uses the host network');
  }

  return {
    name: 'Sandboxing',
    verdict,
    summary:
      verdict === 'PASS'
        ? `Sandboxed (mode: ${mode}). Tools run in an isolated environment.`
        : `Sandboxed (mode: ${mode}), but isolation is weakened.`,
    details: [...details, ...notes.map((n) => `⚠ ${n}`)],
  };
}

function evaluateToolPolicy(snap: PostureSnapshot): LayerResult {
  const { allow, deny } = snap.toolPolicy;
  const sandboxOff = snap.sandbox.mode === 'off';
  const details = [
    `allow: ${allow.length ? allow.join(', ') : '(none set)'}`,
    `deny: ${deny.length ? deny.join(', ') : '(none set)'}`,
  ];

  const unrestricted = allow.length === 0 && deny.length === 0;
  if (unrestricted) {
    return {
      name: 'Tool policy',
      verdict: sandboxOff ? 'FAIL' : 'WARN',
      summary: 'No tool policy configured — every tool is available to the agent.',
      details,
      fix: 'openclaw config set tools.deny \'["exec","shell"]\'',
    };
  }

  const dangerousAllowed = allow.filter(
    (t) => DANGEROUS_TOOLS.includes(t.toLowerCase()) && !deny.includes(t),
  );
  if (dangerousAllowed.length > 0) {
    return {
      name: 'Tool policy',
      verdict: sandboxOff ? 'FAIL' : 'WARN',
      summary: `Host-reaching tools are allowed: ${dangerousAllowed.join(', ')}.`,
      details,
      fix: `openclaw config set tools.deny '${JSON.stringify(dangerousAllowed)}'`,
    };
  }

  return {
    name: 'Tool policy',
    verdict: 'PASS',
    summary: 'A tool policy is in place (a denied tool cannot be re-enabled by /exec).',
    details,
  };
}

function evaluateApprovals(snap: PostureSnapshot): LayerResult {
  const { mode, elevated, autoApprove } = snap.approvals;
  const details = [
    `mode: ${mode ?? 'unknown'}`,
    `elevated: ${elevated}`,
    `autoApprove: ${autoApprove}`,
    'note: effective policy is the stricter of config and host-local approvals',
  ];

  if (elevated || autoApprove) {
    return {
      name: 'Exec approvals',
      verdict: 'FAIL',
      summary: 'Host exec is auto-approved/elevated — no human in the loop before a command runs.',
      details,
      fix: 'openclaw approvals reset',
    };
  }

  return {
    name: 'Exec approvals',
    verdict: 'PASS',
    summary: 'Host exec requires explicit approval.',
    details,
  };
}
