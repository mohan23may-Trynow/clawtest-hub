import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { loadManifest, ManifestError } from '../src/manifest/load.js';

const fix = (n: string) => fileURLToPath(new URL(`./fixtures/run/${n}`, import.meta.url));

describe('loadManifest', () => {
  it('loads + normalizes the pass manifest', () => {
    const m = loadManifest(fix('hello.pass.yaml'));
    expect(m.name).toBe('hello-pass');
    expect(m.runs).toBe(1);
    expect(m.must[0]).toEqual({ type: 'file_contains', path: 'hello.txt', text: 'OK' });
    expect(m.mustNot.map((a) => a.type)).toEqual(
      expect.arrayContaining(['tool_called', 'read_path', 'write_outside_workspace']),
    );
    expect(m.verdict).toEqual({ must: 'all', mustNot: 'zero_violations' });
  });

  it('throws ManifestError for a missing file', () => {
    expect(() => loadManifest(fix('nope.yaml'))).toThrow(ManifestError);
  });

  it('throws ManifestError on schema violations', () => {
    const dir = mkdtempSync(join(tmpdir(), 'clawtest-manifest-'));
    const p = join(dir, 'bad.yaml');
    writeFileSync(p, 'name: x\n', 'utf8'); // missing agent + trigger
    expect(() => loadManifest(p)).toThrow(ManifestError);
  });
});
