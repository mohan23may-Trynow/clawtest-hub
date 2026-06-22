import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let cached: string | undefined;

/** The clawtest-hub version from package.json (cached). Falls back to 0.0.0 if unreadable. */
export function toolVersion(): string {
  if (cached) return cached;
  try {
    const pkg = JSON.parse(readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'));
    cached = typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    cached = '0.0.0';
  }
  return cached ?? '0.0.0';
}
