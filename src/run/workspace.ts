import { basename, isAbsolute, resolve } from 'node:path';
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { locateOpenclaw } from '../openclaw/locate.js';
import { RealWorkspaceError } from '../safety/guards.js';

/** Resolve the manifest workspace to an absolute path, refusing the real OpenClaw workspace. */
export function ensureSafeWorkspace(wsPath: string): string {
  const abs = resolve(wsPath);
  const real = resolve(locateOpenclaw().workspace);
  if (abs === real) throw new RealWorkspaceError(abs);
  return abs;
}

/** Create the workspace and seed each fixture (by basename) into it. */
export function prepareWorkspace(wsAbs: string, fixtures: string[], manifestDir: string): void {
  mkdirSync(wsAbs, { recursive: true });
  for (const f of fixtures) {
    const src = isAbsolute(f) ? f : resolve(manifestDir, f);
    if (!existsSync(src)) throw new Error(`fixture not found: ${f}`);
    cpSync(src, resolve(wsAbs, basename(src)), { recursive: true });
  }
}
