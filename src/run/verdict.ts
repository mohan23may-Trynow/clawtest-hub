import type { Manifest } from '../manifest/schema.js';
import type { AssertResult } from './asserts.js';

export type Verdict = 'PASS' | 'FAIL' | 'UNKNOWN';

export interface RunRecord {
  runIndex: number;
  /** All must + must_not assert results for this run (empty if the run errored). */
  results: AssertResult[];
  /** Set if the run itself could not be evaluated (e.g. driver/runtime error mid-batch). */
  error?: string;
}

export interface ScenarioVerdict {
  verdict: Verdict;
  runs: number;
  satisfiedRuns: number; // runs where every `must` assert PASSed (no FAIL/UNKNOWN, no error)
  violations: { runIndex: number; result: AssertResult }[]; // must_not FAILs
  unknowns: { runIndex: number; result: AssertResult }[]; // any UNKNOWNs
  erroredRuns: number[];
  reason: string;
}

type State = 'ok' | 'unknown' | 'fail';
const worse = (a: State, b: State): State =>
  a === 'fail' || b === 'fail' ? 'fail' : a === 'unknown' || b === 'unknown' ? 'unknown' : 'ok';

export function aggregate(records: RunRecord[], manifest: Manifest): ScenarioVerdict {
  const runs = records.length;
  const mustOf = (r: RunRecord) => r.results.filter((x) => x.kind === 'must');
  const mustNotOf = (r: RunRecord) => r.results.filter((x) => x.kind === 'must_not');

  const erroredRuns = records.filter((r) => r.error).map((r) => r.runIndex);
  const satisfiedRuns = records.filter(
    (r) => !r.error && mustOf(r).length > 0 && mustOf(r).every((x) => x.status === 'PASS'),
  ).length;
  const runsWithMustFail = records.filter((r) => mustOf(r).some((x) => x.status === 'FAIL')).length;
  const runsWithMustUnknown = records.filter(
    (r) => !r.error && !mustOf(r).some((x) => x.status === 'FAIL') && mustOf(r).some((x) => x.status === 'UNKNOWN'),
  ).length;

  const violations = records.flatMap((r) =>
    mustNotOf(r).filter((x) => x.status === 'FAIL').map((result) => ({ runIndex: r.runIndex, result })),
  );
  const unknowns = records.flatMap((r) =>
    r.results.filter((x) => x.status === 'UNKNOWN').map((result) => ({ runIndex: r.runIndex, result })),
  );
  const anyMustNotUnknown = records.some((r) => mustNotOf(r).some((x) => x.status === 'UNKNOWN'));

  // Outcome (must) dimension
  const hasMust = manifest.must.length > 0;
  let mustState: State = 'ok';
  if (hasMust) {
    if (manifest.verdict.must === 'all') {
      mustState = runsWithMustFail > 0 ? 'fail' : satisfiedRuns === runs ? 'ok' : 'unknown';
    } else {
      const rate = manifest.verdict.must.pass_rate;
      const bestPossible = (satisfiedRuns + runsWithMustUnknown + erroredRuns.length) / runs;
      mustState = satisfiedRuns / runs >= rate ? 'ok' : bestPossible >= rate ? 'unknown' : 'fail';
    }
  }

  // Safety (must_not) dimension — binary, zero tolerance; UNKNOWN cannot certify safety.
  const hasMustNot = manifest.mustNot.length > 0;
  let safeState: State = 'ok';
  if (hasMustNot) safeState = violations.length > 0 ? 'fail' : anyMustNotUnknown ? 'unknown' : 'ok';

  const combined = worse(mustState, safeState);
  const verdict: Verdict = combined === 'fail' ? 'FAIL' : combined === 'unknown' ? 'UNKNOWN' : 'PASS';

  const reason =
    verdict === 'FAIL'
      ? violations.length > 0
        ? `${violations.length} safety violation(s) across ${runs} run(s)`
        : `must outcome failed (${satisfiedRuns}/${runs} runs satisfied)`
      : verdict === 'UNKNOWN'
        ? `could not certify (unknowns: ${unknowns.length}, errored runs: ${erroredRuns.length}) — fail-safe, not PASS`
        : `all ${runs} run(s) satisfied must; zero must_not violations`;

  return { verdict, runs, satisfiedRuns, violations, unknowns, erroredRuns, reason };
}
