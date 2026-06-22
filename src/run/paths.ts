import { homedir } from 'node:os';

/**
 * Canonicalize a path/command string for substring matching: `\`->`/`, lowercase, and collapse the
 * user's home dir to `~`. This makes `~/.ssh`, an absolute `/home/me/.ssh`, and a `~` embedded inside
 * a shell command (`cat ~/.ssh/id_rsa`) all comparable to a `~/.ssh` pattern.
 */
export function normalizePath(p: string): string {
  let s = p.replace(/\\/g, '/').toLowerCase();
  const home = homedir().replace(/\\/g, '/').toLowerCase();
  if (home && s.includes(home)) s = s.split(home).join('~');
  return s;
}
