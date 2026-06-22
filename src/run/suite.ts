import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** List manifest files (*.yaml / *.yml) in a directory, sorted. Empty if the dir is missing. */
export function listManifests(dir: string): string[] {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .map((f) => join(dir, f))
    .filter((p) => statSync(p).isFile());
}
