import { z } from 'zod';

export type Verdict = 'PASS' | 'WARN' | 'UNKNOWN' | 'FAIL';

/** Layer 1 — where tools run (isolation / blast radius). */
export interface SandboxLayer {
  mode: string; // 'off' | 'non-main' | 'all' | 'unknown'
  scope?: string;
  workspaceAccess?: string; // 'none' | 'ro' | 'rw'
  sessionIsSandboxed?: boolean;
}

/** Layer 2 — which tools exist (the hard stop). From sandbox.tools. */
export interface ToolPolicyLayer {
  allow: string[];
  deny: string[];
}

/** Elevation flags, reported alongside the sandbox. */
export interface ElevatedInfo {
  enabled: boolean;
  allowedByConfig: boolean;
}

/** A single exec-policy scope (e.g. tools.exec) with its effective settings. */
export interface ExecScope {
  label: string;
  modeEffective?: string; // 'full' | 'restricted' | 'off'
  askEffective?: string; // 'off' (never prompt) | 'on' | 'untrusted'
  securityEffective?: string;
  hostRequested?: string;
}

/** Layer 3 — whether a host exec may proceed. From exec-policy show. */
export interface ExecPolicyLayer {
  approvalsExists: boolean;
  scopes: ExecScope[];
}

export interface PostureSnapshot {
  sandbox: SandboxLayer;
  toolPolicy: ToolPolicyLayer;
  elevated: ElevatedInfo;
  execPolicy: ExecPolicyLayer;
}

// --- Raw schemas for the JSON emitted by `openclaw ... --json`. ---
// Verified against OpenClaw 2026.6.9. Tolerant by design (passthrough +
// optionals) because OpenClaw moves fast.

export const SandboxExplainRaw = z
  .object({
    sandbox: z
      .object({
        mode: z.string().optional(),
        scope: z.string().optional(),
        workspaceAccess: z.string().optional(),
        sessionIsSandboxed: z.boolean().optional(),
        tools: z
          .object({
            allow: z.array(z.string()).optional(),
            deny: z.array(z.string()).optional(),
          })
          .passthrough()
          .optional(),
      })
      .passthrough()
      .optional(),
    elevated: z
      .object({
        enabled: z.boolean().optional(),
        allowedByConfig: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

const ExecScopeRaw = z
  .object({
    scopeLabel: z.string().optional(),
    mode: z.object({ effective: z.string().optional() }).passthrough().optional(),
    ask: z.object({ effective: z.string().optional() }).passthrough().optional(),
    security: z.object({ effective: z.string().optional() }).passthrough().optional(),
    host: z.object({ requested: z.string().optional() }).passthrough().optional(),
  })
  .passthrough();

export const ExecPolicyShowRaw = z
  .object({
    approvalsExists: z.boolean().optional(),
    effectivePolicy: z
      .object({
        scopes: z.array(ExecScopeRaw).optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();
