import { describe, expect, it, vi } from 'vitest';
import { runPrice } from '../commands/price';
import { renderCsv } from '../format';
import { priceConversation } from '@dyvit/whatsapp-pricing';
import { getScenario } from '@dyvit/whatsapp-scenarios';

async function capture(run: () => Promise<number>): Promise<{ code: number; out: string }> {
  let out = '';
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk) => {
    out += String(chunk);
    return true;
  });
  try {
    const code = await run();
    // Intl.NumberFormat separates "R$" from the digits with a non-breaking space, and
    // which flavour of it ICU picks can change between Node releases. Assertions here are
    // about the numbers, not about the space, so normalize it away.
    return { code, out: out.replace(/[\u00a0\u202f]/g, ' ') };
  } finally {
    spy.mockRestore();
  }
}

const base = { locale: 'pt' as const, json: false, compare: false };

describe('price command', () => {
  it('prints the table, the total and the tips for a bundled scenario', async () => {
    const { code, out } = await capture(() => runPrice({ ...base, scenario: 'worked-example-spec' }));
    expect(code).toBe(0);
    expect(out).toContain('Total: R$ 0,3567');
    expect(out).toContain('marketing');
    expect(out).toContain('Dicas');
    expect(out).toContain('A cobrança oficial é a da Meta.');
  });

  it('shows the October comparison when asked', async () => {
    const { out } = await capture(() => runPrice({ ...base, scenario: 'worked-example-spec', compare: true }));
    expect(out).toContain('R$ 0,3567');
    expect(out).toContain('R$ 0,4267');
  });

  it('prints no data warnings now that every shipped number is sourced', async () => {
    const { out } = await capture(() => runPrice({ ...base, scenario: 'worked-example-spec' }));
    expect(out).not.toContain('Avisos sobre os dados');
  });

  it('always prints the educational-simulation disclaimer, warnings or not', async () => {
    // This line is the one thing that must never be conditional: the tool models Meta's
    // rules, it does not bill anyone.
    for (const locale of ['pt', 'en'] as const) {
      const { out } = await capture(() => runPrice({ ...base, locale, scenario: 'otp-authentication' }));
      expect(out).toContain(locale === 'pt' ? 'A cobrança oficial é a da Meta.' : 'The official bill is Meta');
    }
  });

  it('emits machine-readable output with --json', async () => {
    const { out } = await capture(() => runPrice({ ...base, scenario: 'otp-authentication', json: true }));
    const parsed = JSON.parse(out) as any;
    expect(parsed.priced.totalMicros).toBe(105_000);
    expect(parsed.tips).toBeInstanceOf(Array);
  });

  it('projects a month when --per-month is given', async () => {
    const { out } = await capture(() =>
      runPrice({ ...base, scenario: 'worked-example-spec', conversationsPerMonth: 30_000 }),
    );
    expect(out).toContain('Projeção mensal');
    // 30,000 utility sits inside Meta's first tier: flat list rate, 30,000 x 0,0350.
    expect(out).toContain('R$ 1.050,00');
  });

  it('honours --locale en', async () => {
    const { out } = await capture(() => runPrice({ ...base, locale: 'en', scenario: 'worked-example-spec' }));
    expect(out).toContain('Tips');
    expect(out).toContain('Educational simulation');
  });
});

describe('CSV export', () => {
  it('carries the full trace, one row per message', () => {
    const { messages } = getScenario('worked-example-spec');
    const csv = renderCsv(priceConversation(messages, { asOf: '2026-09-01' }));
    const lines = csv.split('\n');
    expect(lines[0]).toContain('reason_code');
    expect(lines).toHaveLength(messages.length + 1);
    expect(lines[1]).toContain('BILLABLE_MARKETING_TEMPLATE');
  });

  it('quotes fields that contain commas', () => {
    const { messages } = getScenario('worked-example-spec');
    const csv = renderCsv(priceConversation(messages, { asOf: '2026-09-01' }));
    // Explanations contain commas; they must not break the column count.
    for (const line of csv.split('\n').slice(1)) {
      const cells = line.match(/(".*?"|[^,]*)(,|$)/g) ?? [];
      expect(cells.length).toBeGreaterThanOrEqual(15);
    }
  });
});
