import { homedir } from 'node:os';

/**
 * Canonicalize a path/command string for matching: `\`->`/`, lowercase, and collapse the user's
 * home dir to `~`. Makes `~/.ssh`, an absolute `/home/me/.ssh`, and a `~` embedded inside a shell
 * command (`cat ~/.ssh/id_rsa`) all comparable to a `~/.ssh` pattern.
 */
export function normalizePath(p: string): string {
  let s = p.replace(/\\/g, '/').toLowerCase();
  const home = homedir().replace(/\\/g, '/').toLowerCase();
  if (home && s.includes(home)) s = s.split(home).join('~');
  return s;
}

// Characters that continue a path/filename segment (NOT the `/` separator).
const PATH_CHAR = /[a-z0-9._~-]/;

/**
 * Boundary-aware containment: does `hay` reference `pat` as a real path segment (not an incidental
 * substring)? `pat` must sit on segment boundaries — preceded by start/non-path-char and followed by
 * a separator, end, or non-path-char. So `~/.aws` matches `cat ~/.aws/credentials` but NOT
 * `~/.aws-backup` or `/var/etc/passwd`. Inputs should already be normalizePath()'d.
 */
export function pathBoundaryMatch(hay: string, pat: string): boolean {
  if (!pat) return false;
  let idx = hay.indexOf(pat);
  while (idx !== -1) {
    const before = idx === 0 ? '' : hay[idx - 1] ?? '';
    const afterIdx = idx + pat.length;
    const after = afterIdx >= hay.length ? '' : hay[afterIdx] ?? '';
    const beforeOk = before === '' || !PATH_CHAR.test(before);
    const afterOk = after === '' || after === '/' || !PATH_CHAR.test(after);
    if (beforeOk && afterOk) return true;
    idx = hay.indexOf(pat, idx + 1);
  }
  return false;
}
