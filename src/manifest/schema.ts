import { z } from 'zod';

// --- Raw assert shapes (single-key objects, per FEATURE_SPEC_phase2_test_runner.md) ---
const FileContainsRaw = z.object({
  file_contains: z.object({
    path: z.string(),
    text: z.string().optional(),
    expected_count: z.number().int().nonnegative().optional(),
  }),
});
const ReadPathRaw = z.object({ read_path: z.string() });
const WritePathRaw = z.object({ write_path: z.string() });
const ToolCalledRaw = z.object({ tool_called: z.string() });
const WriteOutsideRaw = z.object({ write_outside_workspace: z.boolean() });
const NetworkEgressRaw = z.object({ network_egress: z.string() });
const SecretInOutputRaw = z.object({
  secret_in_output: z.union([
    z.boolean(),
    z.object({ extra_patterns: z.array(z.string()).optional(), allow: z.array(z.string()).optional() }),
  ]),
});

const AssertRaw = z.union([
  FileContainsRaw,
  ReadPathRaw,
  WritePathRaw,
  ToolCalledRaw,
  WriteOutsideRaw,
  NetworkEgressRaw,
  SecretInOutputRaw,
]);
type AssertRaw = z.infer<typeof AssertRaw>;

export const ManifestSchema = z.object({
  name: z.string().min(1),
  agent: z.object({
    workspace: z.string().min(1),
    sandbox: z.enum(['off', 'non-main', 'all']).optional(),
  }),
  runs: z.number().int().positive().default(1),
  trigger: z.object({ message: z.string().min(1) }),
  fixtures: z.array(z.string()).default([]),
  expect: z
    .object({
      must: z.array(AssertRaw).default([]),
      must_not: z.array(AssertRaw).default([]),
    })
    .default({ must: [], must_not: [] }),
  verdict: z
    .object({
      must: z
        .union([z.literal('all'), z.object({ pass_rate: z.number().min(0).max(1) })])
        .default('all'),
      must_not: z.literal('zero_violations').default('zero_violations'),
    })
    .default({ must: 'all', must_not: 'zero_violations' }),
});
export type ManifestRaw = z.infer<typeof ManifestSchema>;

// --- Normalized (tagged) asserts the evaluator consumes ---
export type Assert =
  | { type: 'file_contains'; path: string; text?: string; expected_count?: number }
  | { type: 'read_path'; path: string }
  | { type: 'write_path'; path: string }
  | { type: 'tool_called'; tool: string }
  | { type: 'write_outside_workspace'; value: boolean }
  | { type: 'network_egress'; pattern: string }
  | { type: 'secret_in_output'; extraPatterns?: string[]; allow?: string[] };

export interface Manifest {
  name: string;
  agent: { workspace: string; sandbox?: 'off' | 'non-main' | 'all' };
  runs: number;
  trigger: { message: string };
  fixtures: string[];
  must: Assert[];
  mustNot: Assert[];
  verdict: { must: 'all' | { pass_rate: number }; mustNot: 'zero_violations' };
}

export function normalizeAssert(raw: AssertRaw): Assert {
  if ('file_contains' in raw) return { type: 'file_contains', ...raw.file_contains };
  if ('read_path' in raw) return { type: 'read_path', path: raw.read_path };
  if ('write_path' in raw) return { type: 'write_path', path: raw.write_path };
  if ('tool_called' in raw) return { type: 'tool_called', tool: raw.tool_called };
  if ('write_outside_workspace' in raw)
    return { type: 'write_outside_workspace', value: raw.write_outside_workspace };
  if ('secret_in_output' in raw) {
    const v = raw.secret_in_output;
    return typeof v === 'boolean'
      ? { type: 'secret_in_output' }
      : { type: 'secret_in_output', extraPatterns: v.extra_patterns, allow: v.allow };
  }
  return { type: 'network_egress', pattern: raw.network_egress };
}

export function normalizeManifest(raw: ManifestRaw): Manifest {
  return {
    name: raw.name,
    agent: raw.agent,
    runs: raw.runs,
    trigger: raw.trigger,
    fixtures: raw.fixtures,
    must: raw.expect.must.map(normalizeAssert),
    mustNot: raw.expect.must_not.map(normalizeAssert),
    verdict: { must: raw.verdict.must, mustNot: raw.verdict.must_not },
  };
}
