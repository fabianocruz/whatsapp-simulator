import { describe, expect, it } from 'vitest';
import { getScenario } from '@dyvit/whatsapp-scenarios';
import { priceConversation } from '../price-conversation';
import { projectMonthly, volumeFromConversation } from '../projection';

const TODAY = '2026-09-01';
const OCTOBER = '2026-10-01';

describe('projectMonthly', () => {
  it('prices marketing flat — there are no volume tiers for it', () => {
    const projection = projectMonthly({ marketing: 50_000 }, { asOf: TODAY });
    const marketing = projection.categories.find((c) => c.category === 'marketing')!;
    expect(marketing.amountMicros).toBe(50_000 * 321_700);
    expect(marketing.effectiveRate).toBe(0.3217);
  });

  it('adds the categories up into one monthly total', () => {
    const projection = projectMonthly({ marketing: 1_000, utility: 1_000, authentication: 1_000 }, { asOf: TODAY });
    const sum = projection.categories.reduce((acc, c) => acc + c.amountMicros, 0);
    expect(projection.totalMicros).toBe(sum);
    expect(projection.totalMicros).toBe(1_000 * 321_700 + 1_000 * 35_000 + 1_000 * 35_000);
  });

  it('skips categories with no volume', () => {
    const projection = projectMonthly({ utility: 10 }, { asOf: TODAY });
    expect(projection.categories.map((c) => c.category)).toEqual(['utility']);
  });

  it('raises no data warnings now that the thresholds are sourced from Meta', () => {
    const projection = projectMonthly({ utility: 30_000 }, { asOf: TODAY });
    expect(projection.warnings).toEqual([]);
  });

  it('treats a fractional phone-number count as at least one number', () => {
    const projection = projectMonthly({ service: 1_500 }, { asOf: OCTOBER, phoneNumbers: 0 });
    const service = projection.categories.find((c) => c.category === 'service')!;
    expect(projection.phoneNumbers).toBe(1);
    expect(service.freeByAllowance).toBe(1_000);
  });
});

describe('volumeFromConversation', () => {
  it('scales only the messages the rules actually billed', () => {
    const { messages } = getScenario('worked-example-spec');
    const priced = priceConversation(messages, { asOf: TODAY });

    // Today the conversation bills one marketing and one utility.
    expect(volumeFromConversation(priced, 1)).toEqual({
      marketing: 1,
      utility: 1,
      authentication: 0,
      service: 0,
    });
    expect(volumeFromConversation(priced, 10_000)).toEqual({
      marketing: 10_000,
      utility: 10_000,
      authentication: 0,
      service: 0,
    });
  });

  it('counts the extra billable messages the October ruleset creates', () => {
    const { messages } = getScenario('worked-example-spec');
    const priced = priceConversation(messages, { asOf: OCTOBER });
    expect(volumeFromConversation(priced, 1)).toEqual({
      marketing: 1,
      utility: 2,
      authentication: 0,
      service: 1,
    });
  });

  it('counts nothing from a conversation that was entirely free', () => {
    const { messages } = getScenario('fep-click-to-whatsapp');
    const priced = priceConversation(messages, { asOf: OCTOBER });
    expect(volumeFromConversation(priced, 5_000)).toEqual({
      marketing: 0,
      utility: 0,
      authentication: 0,
      service: 0,
    });
  });
});

describe('conversation scaled into a month', () => {
  it('feeds tiers from a priced conversation end to end', () => {
    const { messages } = getScenario('worked-example-spec');
    const priced = priceConversation(messages, { asOf: TODAY });
    const projection = projectMonthly(volumeFromConversation(priced, 30_000), { asOf: TODAY });

    const marketing = projection.categories.find((c) => c.category === 'marketing')!;
    const utility = projection.categories.find((c) => c.category === 'utility')!;
    expect(marketing.amountMicros).toBe(30_000 * 321_700);
    // 30,000 utility sits inside Meta's first tier, so it prices at the flat list rate.
    expect(utility.amount).toBe(1050);
  });
});
