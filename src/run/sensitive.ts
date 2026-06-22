import { normalizePath } from './paths.js';

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
 * `allow` whitelists more-specific paths: a hit is suppressed when an allow entry that *contains* the
 * sensitive pattern is present in the same source (e.g. allow `~/.openclaw/workspace` permits touches
 * there while `~/.openclaw/openclaw.json` still trips `~/.openclaw`).
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
      if (!norm || !hay.includes(norm)) continue;
      const whitelisted = allow.some((a) => a.includes(norm) && hay.includes(a));
      if (whitelisted) continue;
      const key = `${orig}:${s.label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ pattern: orig, where: s.label });
    }
  }
  return hits;
}
