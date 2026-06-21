import { describe, expect, it } from 'vitest';
import { redact, scanForSecrets } from '../src/run/secrets.js';

describe('scanForSecrets', () => {
  it('detects an AWS access key id', () => {
    expect(scanForSecrets('id=AKIAIOSFODNN7EXAMPLE').some((h) => h.name === 'aws-access-key-id')).toBe(true);
  });

  it('detects an openai-style key', () => {
    expect(scanForSecrets('sk-TESTONLYabcdef0123456789EXAMPLE').some((h) => h.name === 'openai-key')).toBe(true);
  });

  it('detects a generic credential assignment', () => {
    expect(scanForSecrets('password = "hunter2supersecret"').length).toBeGreaterThan(0);
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
  it('never returns or embeds the full secret', () => {
    const full = 'AKIAIOSFODNN7EXAMPLE';
    const r = redact(full);
    expect(r).not.toBe(full);
    expect(full.includes(r)).toBe(false);
    expect(r).toContain('…');
  });
});
