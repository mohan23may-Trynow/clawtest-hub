import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { execa } from 'execa';

/** Result of running a single `openclaw` subcommand. */
export type ExecOutcome =
  | { status: 'ok'; stdout: string; stderr: string }
  | { status: 'not-installed'; message: string }
  | { status: 'unreachable'; message: string; stderr: string }
  | { status: 'error'; message: string; stderr: string; code: number | null };

export interface OpenclawRunner {
  /** Run `openclaw <args>` and return a typed outcome (never throws on a missing binary). */
  run(args: string[]): Promise<ExecOutcome>;
}

/** Runs the real `openclaw` CLI on the host. */
export function liveRunner(binary = 'openclaw'): OpenclawRunner {
  return {
    async run(args: string[]): Promise<ExecOutcome> {
      try {
        const res = (await execa(binary, args, { reject: false })) as {
          exitCode?: number;
          stdout?: string;
          stderr?: string;
          code?: string;
        };
        if (res.code === 'ENOENT') {
          return notInstalled();
        }
        if (res.exitCode === 0) {
          return { status: 'ok', stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
        }
        const stderr = res.stderr ?? '';
        if (looksNotInstalled(stderr)) {
          return notInstalled();
        }
        if (isUnreachable(stderr)) {
          return {
            status: 'unreachable',
            message:
              'The OpenClaw gateway is not reachable. Is it running? (try `openclaw gateway status`)',
            stderr,
          };
        }
        return {
          status: 'error',
          message: `\`openclaw ${args.join(' ')}\` exited with code ${res.exitCode ?? 'unknown'}`,
          stderr,
          code: res.exitCode ?? null,
        };
      } catch (err) {
        const e = err as NodeJS.ErrnoException;
        if (e.code === 'ENOENT') {
          return notInstalled();
        }
        return { status: 'error', message: e.message, stderr: '', code: null };
      }
    },
  };
}

/**
 * Reads recorded command outputs from a directory instead of calling the live CLI.
 * Lets the tool run (and be tested) without OpenClaw installed. Flags in the args
 * (e.g. `--json`) are ignored when matching; only the subcommand path matters.
 */
export function fixtureRunner(dir: string): OpenclawRunner {
  const fileFor: Record<string, string> = {
    'sandbox explain': 'sandbox-explain.json',
    'approvals get': 'approvals-get.json',
    'config get tools': 'config-tools.json',
  };
  return {
    async run(args: string[]): Promise<ExecOutcome> {
      const key = args.filter((a) => !a.startsWith('-')).join(' ');
      const file = fileFor[key];
      if (!file) {
        return { status: 'error', message: `No fixture mapping for: \`openclaw ${key}\``, stderr: '', code: null };
      }
      const path = join(dir, file);
      if (!existsSync(path)) {
        return {
          status: 'error',
          message: `Fixture file not found: ${path}`,
          stderr: '',
          code: null,
        };
      }
      return { status: 'ok', stdout: readFileSync(path, 'utf8'), stderr: '' };
    },
  };
}

function notInstalled(): ExecOutcome {
  return {
    status: 'not-installed',
    message:
      'The `openclaw` CLI was not found on your PATH. Install OpenClaw from https://openclaw.ai, ' +
      'or pass --from-fixture <dir> to run against recorded sample output.',
  };
}

function looksNotInstalled(stderr: string): boolean {
  const s = stderr.toLowerCase();
  return (
    s.includes('not recognized') || // Windows cmd
    s.includes('command not found') || // POSIX shell
    s.includes('no such file') ||
    s.includes('cannot find')
  );
}

function isUnreachable(stderr: string): boolean {
  const s = stderr.toLowerCase();
  if (s.includes('econnrefused') || s.includes('connection refused') || s.includes('could not connect')) {
    return true;
  }
  return s.includes('gateway') && (s.includes('not running') || s.includes('unreachable'));
}
