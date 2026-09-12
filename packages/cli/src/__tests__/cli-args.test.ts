import { describe, expect, it, vi } from 'vitest';
import { main } from '../cli';

/**
 * The invocations the README tells people to run.
 *
 * `pnpm cli -- price ...` forwards the `--` separator into argv, and an earlier version
 * read that as the command name and then rejected `price` as an unexpected positional.
 * Every documented command is pinned here, because the first thing a new contributor does
 * is copy a line out of the README.
 */
async function run(argv: string[]): Promise<{ code: number; out: string }> {
  let out = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  try {
    const code = await main(argv);
    // Intl separates "R$" from the digits with a non-breaking space; these assertions are
    // about arguments, not about which space ICU picked.
    return { code, out: out.replace(/[\u00a0\u202f]/g, ' ') };
  } finally {
    spy.mockRestore();
  }
}

describe('argument parsing', () => {
  it('accepts the pnpm separator the README uses', async () => {
    const { code, out } = await run(['--', 'price', '--scenario', 'worked-example-spec']);
    expect(code).toBe(0);
    expect(out).toContain('R$ 0,3567');
  });

  it('accepts the same command without the separator', async () => {
    const { code, out } = await run(['price', '--scenario', 'worked-example-spec']);
    expect(code).toBe(0);
    expect(out).toContain('R$ 0,3567');
  });

  it('defaults to price when no command is given', async () => {
    const { out } = await run(['--scenario', 'otp-authentication']);
    expect(out).toContain('authentication');
  });

  it('lists the bundled scenarios', async () => {
    const { code, out } = await run(['--', 'scenarios']);
    expect(code).toBe(0);
    expect(out).toContain('worked-example-spec');
    expect(out).toContain('fep-click-to-whatsapp');
  });

  it('prints help for --help and for the help command', async () => {
    for (const argv of [['--help'], ['help'], ['--', 'help']]) {
      const { code, out } = await run(argv);
      expect(code, argv.join(' ')).toBe(0);
      expect(out, argv.join(' ')).toContain('dyvit-wa-sim');
      expect(out, argv.join(' ')).toContain('serve');
    }
  });

  it('honours --compare, --per-month and --locale together', async () => {
    const { out } = await run([
      '--', 'price', '--scenario', 'worked-example-spec',
      '--compare', '--per-month', '30000', '--locale', 'en',
    ]);
    expect(out).toContain('Tips');
    expect(out).toContain('Monthly projection');
    expect(out).toContain('Compared with 2026-10-01');
  });
});
