import { describe, expect, it, vi } from 'vitest';
import { runPrice } from '../commands/price.js';
import { renderCsv } from '../format.js';
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
    return { code, out };
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
    expect(out).toContain('A cobranca oficial e a da Meta.');
  });

  it('shows the October comparison when asked', async () => {
    const { out } = await capture(() => runPrice({ ...base, scenario: 'worked-example-spec', compare: true }));
    expect(out).toContain('R$ 0,3567');
    expect(out).toContain('R$ 0,4267');
  });

  it('always warns that the shipped tier thresholds are placeholders', async () => {
    const { out } = await capture(() => runPrice({ ...base, scenario: 'worked-example-spec' }));
    expect(out).toContain('Avisos sobre os dados');
    expect(out).toContain('placeholder');
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
    expect(out).toContain('Projecao mensal');
    // 30,000 marketing + the 30,000 utility split across the placeholder tiers.
    expect(out).toContain('R$ 1.007,00');
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
