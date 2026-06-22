export interface SecretHit {
  name: string;
  /** Masked form — safe to print. Never the full secret, never reconstructable from it. */
  redacted: string;
}

interface NamedPattern {
  name: string;
  re: RegExp;
  /** Optional precision gate: only count the match if this returns true. */
  validate?: (m: RegExpExecArray) => boolean;
}

/** A captured value looks like a real credential (not a benign prose word). */
function credentialShaped(v: string | undefined): boolean {
  if (!v || v.length < 12) return false;
  return /[A-Za-z]/.test(v) && /[0-9]/.test(v); // mixed letters+digits, reasonably long
}

// Named credential patterns. High-precision specific shapes first; the generic assignment is gated
// by credentialShaped() so benign mentions (e.g. token: "the meeting") don't trip it.
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
    validate: (m) => credentialShaped(m[1]),
  },
];

/**
 * Mask a value so evidence never leaks it or lets it be reconstructed from the shown chars.
 * Short values are fully masked (length only); longer ones reveal a few framing chars.
 */
export function redact(s: string): string {
  const len = s.length;
  const keep = len <= 8 ? 0 : len <= 16 ? 2 : 4;
  if (keep === 0) return `***(${len} chars)`;
  return `${s.slice(0, keep)}…${s.slice(-keep)}`;
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
  for (const { name, re, validate } of patterns) {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      const full = m[0];
      if (m.index === re.lastIndex) re.lastIndex++; // guard against zero-width matches
      if (validate && !validate(m)) continue;
      if (allow.has(full) || (m[1] !== undefined && allow.has(m[1]))) continue;
      const key = `${name}:${full}`;
      if (seen.has(key)) continue;
      seen.add(key);
      hits.push({ name, redacted: redact(full) });
    }
  }
  return hits;
}
