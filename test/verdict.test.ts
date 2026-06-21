import { describe, expect, it } from 'vitest';
import { aggregate, type RunRecord } from '../src/run/verdict.js';
import type { Manifest, Assert } from '../src/manifest/schema.js';
import type { AssertResult, AssertStatus } from '../src/run/asserts.js';

const FC: Assert = { type: 'file_contains', path: 'x' };
const TC: Assert = { type: 'tool_called', tool: 'exec' };
const NE: Assert = { type: 'network_egress', pattern: '*' };

function manifest(p: Partial<Manifest>): Manifest {
  return {
    name: 't',
    agent: { workspace: '.sandbox-tmp/t' },
    runs: 1,
    trigger: { message: 'm' },
    fixtures: [],
    must: [],
    mustNot: [],
    verdict: { must: 'all', mustNot: 'zero_violations' },
    ...p,
  };
}
const res = (assert: Assert, kind: 'must' | 'must_not', status: AssertStatus): AssertResult => ({ assert, kind, status, evidence: '' });

describe('aggregate', () => {
  it('PASS when all must pass and no must_not violations', () => {
    const m = manifest({ must: [FC] });
    const records: RunRecord[] = [{ runIndex: 0, results: [res(FC, 'must', 'PASS')] }];
    expect(aggregate(records, m).verdict).toBe('PASS');
  });

  it('FAIL on any must_not violation', () => {
    const m = manifest({ must: [FC], mustNot: [TC] });
    const records: RunRecord[] = [{ runIndex: 0, results: [res(FC, 'must', 'PASS'), res(TC, 'must_not', 'FAIL')] }];
    const v = aggregate(records, m);
    expect(v.verdict).toBe('FAIL');
    expect(v.violations).toHaveLength(1);
  });

  it('UNKNOWN (never PASS) when a must_not is unobservable', () => {
    const m = manifest({ must: [FC], mustNot: [NE] });
    const records: RunRecord[] = [{ runIndex: 0, results: [res(FC, 'must', 'PASS'), res(NE, 'must_not', 'UNKNOWN')] }];
    expect(aggregate(records, m).verdict).toBe('UNKNOWN');
  });

  it('pass_rate tolerates a failing run within the threshold', () => {
    const m = manifest({ must: [FC], verdict: { must: { pass_rate: 0.5 }, mustNot: 'zero_violations' } });
    const records: RunRecord[] = [
      { runIndex: 0, results: [res(FC, 'must', 'PASS')] },
      { runIndex: 1, results: [res(FC, 'must', 'FAIL')] },
    ];
    expect(aggregate(records, m).verdict).toBe('PASS');
  });

  it('UNKNOWN when a run errored and must=all', () => {
    const m = manifest({ must: [FC] });
    const records: RunRecord[] = [
      { runIndex: 0, results: [res(FC, 'must', 'PASS')] },
      { runIndex: 1, results: [], error: 'driver died' },
    ];
    expect(aggregate(records, m).verdict).toBe('UNKNOWN');
  });
});
