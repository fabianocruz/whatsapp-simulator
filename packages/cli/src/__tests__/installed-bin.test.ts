import { spawnSync } from 'node:child_process';
import { lstatSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * The binary, run the way a user runs it: packed, installed, invoked through the symlink
 * npm puts in `node_modules/.bin`.
 *
 * 0.1.0 was published with an entrypoint check that compared `import.meta.url` against a
 * raw `process.argv[1]`. Node resolves the bin symlink when it loads the module, so those
 * two are never the same path once installed: the published binary parsed nothing, ran no
 * command and exited 0. `npx @dyvit/whatsapp-simulator-cli serve` printed nothing and
 * started no server, which is the worst possible failure — silence that looks like
 * success.
 *
 * Running `node dist/cli.js` proves nothing here, because that is precisely the path that
 * worked. Only an installed bin exercises the symlink, so this test pays for a build, a
 * pack and an install.
 */

const packageRoot = fileURLToPath(new URL('../..', import.meta.url));

let probeDir: string;
let binPath: string;

function run(command: string, args: string[], cwd: string) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8' });
  if (result.error) throw result.error;
  return result;
}

beforeAll(() => {
  probeDir = mkdtempSync(join(tmpdir(), 'dyvit-wa-sim-probe-'));

  // CI runs the test suite without building the packages, so the tarball has to be made
  // here rather than assumed.
  const built = run('pnpm', ['build'], packageRoot);
  expect(built.status, `build failed:\n${built.stdout}\n${built.stderr}`).toBe(0);

  const packed = run('pnpm', ['pack', '--pack-destination', probeDir], packageRoot);
  expect(packed.status, `pack failed:\n${packed.stdout}\n${packed.stderr}`).toBe(0);

  const tarball = readdirSync(probeDir).find((name) => name.endsWith('.tgz'));
  expect(tarball, `no tarball in ${probeDir}`).toBeDefined();

  writeFileSync(join(probeDir, 'package.json'), JSON.stringify({ name: 'probe', private: true }));
  // The package has no runtime dependencies, so this install needs no network.
  const installed = run(
    'npm',
    ['install', join(probeDir, tarball!), '--no-audit', '--no-fund', '--ignore-scripts'],
    probeDir,
  );
  expect(installed.status, `install failed:\n${installed.stdout}\n${installed.stderr}`).toBe(0);

  binPath = join(probeDir, 'node_modules', '.bin', 'dyvit-wa-sim');
}, 300_000);

afterAll(() => {
  if (probeDir) rmSync(probeDir, { recursive: true, force: true });
});

describe('the installed binary', () => {
  it('is reached through a symlink, which is what made the bug invisible', () => {
    // On Windows npm writes a .cmd shim instead and argv[1] is already the real path.
    // There the raw comparison holds, so guard the assertion rather than the test.
    if (process.platform !== 'win32') {
      expect(lstatSync(binPath).isSymbolicLink()).toBe(true);
    }
  });

  it('runs a command and prints something', () => {
    const { status, stdout, stderr } = run(binPath, ['--help'], probeDir);
    expect(stdout.length, `the binary printed nothing. stderr:\n${stderr}`).toBeGreaterThan(0);
    expect(stdout).toContain('dyvit-wa-sim');
    expect(stdout).toContain('price');
    expect(stdout).toContain('serve');
    expect(status).toBe(0);
  });

  it('prices a scenario, so the exit code is not the only thing that ran', () => {
    const { status, stdout } = run(binPath, ['price', '--scenario', 'worked-example-spec'], probeDir);
    expect(stdout.replace(/[  ]/g, ' ')).toContain('R$ 0,3567');
    expect(status).toBe(0);
  });

  it('refuses an unknown command instead of exiting 0 in silence', () => {
    const { status, stderr } = run(binPath, ['nonsense'], probeDir);
    expect(stderr).toContain('unknown command');
    expect(status).toBe(2);
  });
});
