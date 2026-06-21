import { z } from 'zod';

export type Verdict = 'PASS' | 'WARN' | 'FAIL';

/** Layer 1 — where tools run (isolation / blast radius). */
export interface SandboxLayer {
  mode: string; // 'off' | 'non-main' | 'all' | 'unknown'
  workspaceAccess?: string; // 'none' | 'ro' | 'rw'
  scope?: string;
  backend?: string;
  network?: string;
  binds: string[]; // host:container mounts that pierce the sandbox
}

/** Layer 2 — which tools exist (the hard stop). */
export interface ToolPolicyLayer {
  allow: string[];
  deny: string[];
}

/** Layer 3 — whether a host exec may proceed. */
export interface ApprovalsLayer {
  mode?: string; // 'prompt' | 'ask' | 'auto' | 'elevated'
  elevated: boolean;
  autoApprove: boolean;
}

export interface PostureSnapshot {
  sandbox: SandboxLayer;
  toolPolicy: ToolPolicyLayer;
  approvals: ApprovalsLayer;
}

// --- Raw schemas for the JSON emitted by `openclaw ... --json`. ---
// Tolerant by design: OpenClaw moves fast, so unknown keys pass through and
// missing keys fall back to safe-but-honest defaults during normalization.

export const SandboxRaw = z
  .object({
    mode: z.string().optional(),
    workspaceAccess: z.string().optional(),
    scope: z.string().optional(),
    backend: z.string().optional(),
    network: z.string().optional(),
    binds: z.array(z.string()).optional(),
    docker: z
      .object({
        binds: z.array(z.string()).optional(),
        network: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const ApprovalsRaw = z
  .object({
    mode: z.string().optional(),
    elevated: z.boolean().optional(),
    autoApprove: z.boolean().optional(),
  })
  .passthrough();

export const ToolsRaw = z
  .object({
    allow: z.array(z.string()).optional(),
    deny: z.array(z.string()).optional(),
  })
  .passthrough();
