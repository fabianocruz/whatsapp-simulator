import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'out', '.git']);

/**
 * Generated and vendored trees. Next writes its own type files with `.js` specifiers, and
 * the prefix match covers `.next`, `.next-dev` and `.next-build` at once: an exact list
 * silently stopped skipping the day the dev output moved to its own folder, and this test
 * started failing on code nobody wrote.
 */
function isSkipped(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith('.next');
}

function sourceFiles(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (isSkipped(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.tsx?$/.test(entry)) found.push(full);
  }
  return found;
}

/**
 * The whole monorepo ships TypeScript source rather than a build, and the web app pulls
 * that source straight through Next's webpack via `transpilePackages`. Webpack does not
 * rewrite a `./types.js` specifier onto `types.ts` the way vitest, tsx and tsc's Bundler
 * resolution all do, so a single `.js` suffix compiles and tests clean while breaking
 * `pnpm build:web` — which only runs in CI. This test moves that failure to the fast loop.
 *
 * The convention: with `moduleResolution: "Bundler"`, relative imports carry no extension.
 */
describe('relative import specifiers', () => {
  const offenders: string[] = [];
  for (const file of [...sourceFiles(join(REPO_ROOT, 'packages')), ...sourceFiles(join(REPO_ROOT, 'apps'))]) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/from\s+'(\.{1,2}\/[^']*\.js)'/g)) {
      offenders.push(`${file.slice(REPO_ROOT.length + 1)}: ${match[1]}`);
    }
  }

  it('carry no .js extension, because webpack will not map it back to .ts', () => {
    expect(offenders).toEqual([]);
  });

  it('scans a plausible number of files, so a broken walk cannot pass silently', () => {
    const scanned = [...sourceFiles(join(REPO_ROOT, 'packages')), ...sourceFiles(join(REPO_ROOT, 'apps'))];
    expect(scanned.length).toBeGreaterThan(30);
  });
});
