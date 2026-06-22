import { describe, expect, it } from 'vitest';
import { matchSensitive } from '../src/run/sensitive.js';

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
