import { readFileSync } from 'node:fs';
import { parse as parseYaml } from 'yaml';
import { ManifestSchema, normalizeManifest, type Manifest } from './schema.js';

export class ManifestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ManifestError';
  }
}

/** Read + validate a YAML manifest into a normalized Manifest. Throws ManifestError on problems. */
export function loadManifest(path: string): Manifest {
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    throw new ManifestError(`Could not read manifest: ${path}`);
  }

  let doc: unknown;
  try {
    doc = parseYaml(text);
  } catch (err) {
    throw new ManifestError(`Invalid YAML in ${path}: ${err instanceof Error ? err.message : String(err)}`);
  }

  const parsed = ManifestSchema.safeParse(doc);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  - ${i.path.join('.') || '(root)'}: ${i.message}`)
      .join('\n');
    throw new ManifestError(`Manifest ${path} failed validation:\n${issues}`);
  }
  return normalizeManifest(parsed.data);
}
