import { describe, expect, it } from 'vitest';
import { fixtureRunner, liveRunner } from '../src/openclaw/exec.js';
import { fileURLToPath } from 'node:url';

describe('liveRunner', () => {
  it('reports not-installed for a missing binary (ENOENT or Windows "not recognized")', async () => {
    const outcome = await liveRunner('clawtest-nonexistent-binary-xyz').run(['sandbox', 'explain']);
    expect(outcome.status).toBe('not-installed');
  });
});

describe('fixtureRunner', () => {
  it('maps a subcommand to its recorded file, ignoring flags', async () => {
    const dir = fileURLToPath(new URL('./fixtures/safe', import.meta.url));
    const outcome = await fixtureRunner(dir).run(['sandbox', 'explain', '--json']);
    expect(outcome.status).toBe('ok');
  });

  it('errors when a fixture file is missing', async () => {
    const dir = fileURLToPath(new URL('./fixtures/does-not-exist', import.meta.url));
    const outcome = await fixtureRunner(dir).run(['sandbox', 'explain']);
    expect(outcome.status).toBe('error');
  });
});
