import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { observeRun, parseTrajectory } from '../src/run/observe.js';
import type { AgentTurnResult } from '../src/openclaw/agent.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/run/${n}`, import.meta.url));

describe('parseTrajectory', () => {
  it('extracts a write tool call + path from the scrubbed pass trajectory', () => {
    const calls = parseTrajectory(fix('pass/trajectory.jsonl'));
    const write = calls.find((c) => c.name === 'write');
    expect(write?.args.path).toBe('hello.txt');
  });

  it('extracts read + exec calls from the leaky trajectory', () => {
    const calls = parseTrajectory(fix('leaky/trajectory.jsonl'));
    expect(calls.map((c) => c.name)).toEqual(expect.arrayContaining(['read', 'exec']));
    expect(calls.find((c) => c.name === 'read')?.args.path).toBe('~/.clawdbot/.env');
  });
});

describe('observeRun', () => {
  it('derives reads/writes from the trajectory and tools from toolSummary', () => {
    const result = {
      ok: true,
      payloads: [],
      aborted: false,
      toolSummary: { calls: 2, tools: ['read', 'exec'], failures: 0 },
      trajectoryPath: fix('leaky/trajectory.jsonl'),
      raw: {},
    } as AgentTurnResult;
    const obs = observeRun(result, fileURLToPath(new URL('./fixtures/run', import.meta.url)));
    expect(obs.toolsCalled).toEqual(['read', 'exec']);
    expect(obs.reads).toContain('~/.clawdbot/.env');
    expect(obs.trajectoryAvailable).toBe(true);
  });

  it('marks trajectory unavailable when there is no trajectory path', () => {
    const result = {
      ok: true,
      payloads: [],
      aborted: true,
      toolSummary: { calls: 0, tools: [], failures: 0 },
      raw: {},
    } as AgentTurnResult;
    const obs = observeRun(result, fileURLToPath(new URL('./fixtures/run', import.meta.url)));
    expect(obs.trajectoryAvailable).toBe(false);
  });
});
