import { describe, expect, it } from 'vitest';
import { redact, scanForSecrets } from '../src/run/secrets.js';

describe('scanForSecrets', () => {
  it('detects an AWS access key id', () => {
    expect(scanForSecrets('id=AKIAIOSFODNN7EXAMPLE').some((h) => h.name === 'aws-access-key-id')).toBe(true);
  });

  it('detects an openai-style key', () => {
    expect(scanForSecrets('sk-TESTONLYabcdef0123456789EXAMPLE').some((h) => h.name === 'openai-key')).toBe(true);
  });

  it('detects a credential-shaped generic assignment', () => {
    expect(scanForSecrets('password = "hunter2supersecret"').length).toBeGreaterThan(0);
  });

  it('does NOT flag benign mentions (tightened generic pattern)', () => {
    expect(scanForSecrets('the secret to success is persistence')).toHaveLength(0); // no = / :
    expect(scanForSecrets('password = "changeme"')).toHaveLength(0); // too short
    expect(scanForSecrets('apikey: "documentation"')).toHaveLength(0); // letters only, no digit
    expect(scanForSecrets('token: "the meeting"')).toHaveLength(0); // not credential-shaped
  });

  it('does not double-count one secret matched by both a specific and the generic pattern', () => {
    // `openai_api_key=sk-…` is caught by openai-key (value `sk-…`) AND generic-credential-assignment
    // (captured group `sk-…`) — the same secret. It must be reported exactly once, by the specific name.
    const hits = scanForSecrets('openai_api_key=sk-TESTONLYabcdef0123456789EXAMPLE');
    expect(hits).toHaveLength(1);
    expect(hits[0]?.name).toBe('openai-key');
  });

  it('returns nothing for clean text', () => {
    expect(scanForSecrets('hello world, total 7 rows after dedup')).toHaveLength(0);
  });

  it('respects the allow-list (known decoy)', () => {
    expect(scanForSecrets('AKIAIOSFODNN7EXAMPLE', { allow: ['AKIAIOSFODNN7EXAMPLE'] })).toHaveLength(0);
  });

  it('supports project-specific extra_patterns', () => {
    expect(scanForSecrets('code INTERNAL-ABCD1234', { extraPatterns: ['INTERNAL-[A-Z0-9]{8}'] }).length).toBeGreaterThan(0);
  });
});

describe('redact', () => {
  it('never returns or embeds the full secret (long value)', () => {
    const full = 'AKIAIOSFODNN7EXAMPLE';
    const r = redact(full);
    expect(r).not.toBe(full);
    expect(full.includes(r)).toBe(false);
    expect(r).toContain('…');
  });

  it('fully masks short values (not reconstructable from shown chars)', () => {
    const r = redact('AKIA1234'); // 8 chars
    expect(r).toBe('***(8 chars)');
    expect(r).not.toContain('AKIA');
    expect(r).not.toContain('1234');
  });
});
