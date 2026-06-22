import { normalizePath, pathBoundaryMatch } from './paths.js';

// NOTE (known gap): this default list is Unix-centric (~ + POSIX paths). Windows host locations
// (e.g. %USERPROFILE%\.aws, AppData credential stores) and some macOS-specific paths are NOT covered
// by the defaults — add them via the manifest `paths:` extension. Tracked as host-coverage TODO.
/** High-value locations an agent should not be reaching for. Extend per-manifest via `paths`. */
export const DEFAULT_SENSITIVE_PATHS = [
  '~/.ssh',
  '~/.aws/credentials',
  '~/.aws',
  '~/.openclaw',
  '~/.clawdbot/.env',
  '~/.gnupg',
  '~/.npmrc',
  '~/.git-credentials',
  '~/.kube/config',
  '~/.docker/config.json',
  '/etc/passwd',
  '/etc/shadow',
];

export interface SensitiveSource {
  label: string;
  text: string;
}

export interface SensitiveHit {
  pattern: string; // the sensitive path that matched (original form, for evidence)
  where: string; // source label (e.g. "read ~/.ssh/id_rsa" or "exec")
}

/**
 * Find sensitive-path references across the given sources (read/write paths + exec command strings).
 * Matching is **path-boundary-aware** (not naive substring): `~/.aws` matches `cat ~/.aws/creds` but
 * not `~/.aws-backup`. `allow` is a backstop, not the primary defense — it whitelists a more-specific
 * subpath (e.g. allow `~/.openclaw/workspace` permits touches there while `~/.openclaw/openclaw.json`
 * still trips `~/.openclaw`).
 *
 * The exec-command scan is **best-effort**: it catches naive path references inside a command string,
 * NOT obfuscated or variable-indirected access (e.g. `cat $SECRET_PATH`, base64-decoded paths). The
 * backstop is `tool_called: exec` / `process`, which flags shell use itself even when path extraction
 * misses — pair the two invariants.
 */
export function matchSensitive(
  sources: SensitiveSource[],
  opts: { paths?: string[]; allow?: string[] } = {},
): SensitiveHit[] {
  const patterns = [...DEFAULT_SENSITIVE_PATHS, ...(opts.paths ?? [])].map((orig) => ({
    orig,
    norm: normalizePath(orig),
  }));
  const allow = (opts.allow ?? []).map(normalizePath);
  const hits: SensitiveHit[] = [];
  const seen = new Set<string>();

  for (const s of sources) {
    const hay = normalizePath(s.text);
    for (const { orig, norm } of patterns) {
      if (!norm || !pathBoundaryMatch(hay, norm)) continue;
      const whitelisted = allow.some((a) => a.includes(norm) && pathBoundaryMatch(hay, a));
      if (whitelisted) continue;
      const key = `${orig}:${s.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ pattern: orig, where: s.label });
    }
  }
  return hits;
}
