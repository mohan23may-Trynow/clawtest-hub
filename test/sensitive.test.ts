import { describe, expect, it } from 'vitest';
import { DEFAULT_SENSITIVE_PATHS, matchSensitive } from '../src/run/sensitive.js';

describe('DEFAULT_SENSITIVE_PATHS (platform-aware)', () => {
  it('includes common home-based paths plus this platform\'s host locations', () => {
    expect(DEFAULT_SENSITIVE_PATHS).toContain('~/.ssh');
    if (process.platform === 'win32') {
      expect(DEFAULT_SENSITIVE_PATHS.some((p) => p.includes('appdata'))).toBe(true);
    } else if (process.platform === 'darwin') {
      expect(DEFAULT_SENSITIVE_PATHS.some((p) => p.toLowerCase().includes('library'))).toBe(true);
    } else {
      expect(DEFAULT_SENSITIVE_PATHS).toContain('/etc/passwd');
    }
  });
});

describe('matchSensitive', () => {
  it('flags a sensitive read path', () => {
    const hits = matchSensitive([{ label: 'read ~/.ssh/id_rsa', text: '~/.ssh/id_rsa' }]);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]?.pattern).toBe('~/.ssh');
  });

  it('flags a sensitive path inside a shell command (closes the read_path blind spot)', () => {
    const hits = matchSensitive([{ label: 'exec', text: 'cat ~/.aws/credentials' }]);
    expect(hits.some((h) => h.pattern === '~/.aws/credentials' || h.pattern === '~/.aws')).toBe(true);
  });

  it('returns nothing for a benign workspace path', () => {
    expect(matchSensitive([{ label: 'write leads.csv', text: 'leads.csv' }])).toHaveLength(0);
  });

  it('is boundary-aware: ignores incidental substrings', () => {
    expect(matchSensitive([{ label: 'exec', text: 'rm -rf ~/.aws-backup' }])).toHaveLength(0);
    expect(matchSensitive([{ label: 'read', text: '/var/etc/passwd-notes' }])).toHaveLength(0);
    expect(matchSensitive([{ label: 'exec', text: 'echo configuring aws credentials' }])).toHaveLength(0);
  });

  it('allow whitelists a more-specific path while the parent stays sensitive', () => {
    // touching ~/.openclaw/workspace is allowed...
    expect(
      matchSensitive([{ label: 'read', text: '~/.openclaw/workspace/leads.csv' }], { allow: ['~/.openclaw/workspace'] }),
    ).toHaveLength(0);
    // ...but the config file under the same sensitive root still trips
    expect(
      matchSensitive([{ label: 'read', text: '~/.openclaw/openclaw.json' }], { allow: ['~/.openclaw/workspace'] }).length,
    ).toBeGreaterThan(0);
  });

  it('supports project-specific extra paths', () => {
    expect(matchSensitive([{ label: 'read', text: '/srv/app/secrets.yml' }], { paths: ['/srv/app/secrets.yml'] }).length).toBeGreaterThan(0);
  });
});
