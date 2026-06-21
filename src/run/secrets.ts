export interface SecretHit {
  name: string;
  /** Masked form — safe to print. Never the full secret. */
  redacted: string;
}

interface NamedPattern {
  name: string;
  re: RegExp;
}

// Named credential patterns. Conservative + well-known shapes (v1 = patterns, not entropy).
const BUILTIN: NamedPattern[] = [
  { name: 'aws-access-key-id', re: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'openai-key', re: /\bsk-[A-Za-z0-9_-]{16,}\b/g },
  { name: 'github-token', re: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/g },
  { name: 'slack-token', re: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'jwt', re: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  { name: 'private-key-block', re: /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g },
  {
    name: 'generic-credential-assignment',
    re: /(?:api[_-]?key|secret|token|password|passwd|pwd)\s*[:=]\s*["']?([A-Za-z0-9_\-]{8,})["']?/gi,
  },
];

/** Mask the middle of a value so evidence never leaks the full secret (even a decoy). */
export function redact(s: string): string {
  if (s.length <= 8) return `${s.slice(0, 1)}…${s.slice(-1)}`;
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
}

export function scanForSecrets(
  text: string,
  opts: { extraPatterns?: string[]; allow?: string[] } = {},
): SecretHit[] {
  const allow = new Set(opts.allow ?? []);
  const patterns: NamedPattern[] = [
    ...BUILTIN,
    ...(opts.extraPatterns ?? []).map((p, i) => ({ name: `custom-${i + 1}`, re: new RegExp(p, 'g') })),
  ];
  const hits: SecretHit[] = [];
  const seen = new Set<string>();
  for (const { name, re } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const full = m[0];
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width matches
      if (allow.has(full)) continue;
      const key = `${name}:${full}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ name, redacted: redact(full) });
    }
  }
  return hits;
}
