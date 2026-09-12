import { describe, expect, it, vi } from 'vitest';
import { getScenario } from '@dyvit/whatsapp-scenarios';
import * as data from '@dyvit/whatsapp-pricing-data';
import type { RuleSet } from '@dyvit/whatsapp-pricing-data';
import { priceConversation } from '../price-conversation';
import { priceTieredVolume } from '../tiers';
import { projectMonthly, volumeFromConversation, type VolumeByCategory } from '../projection';

const TODAY = '2026-09-01';
const OCTOBER = '2026-10-01';

/** Runs projectMonthly against a ruleset variant, to exercise a flag the data ships off. */
function projectMonthlyWith(ruleSet: RuleSet, volumes: Partial<VolumeByCategory>) {
  const spy = vi.spyOn(data, 'selectRuleSet').mockReturnValue(ruleSet);
  try {
    return projectMonthly(volumes, { asOf: OCTOBER, market: 'BR', currency: 'BRL' });
  } finally {
    spy.mockRestore();
  }
}

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

describe('service volume tiers, if Meta ever confirms they apply', () => {
  /**
   * The ruleset ships with serviceUsesVolumeTiers=false because Meta does not confirm it.
   * The branch still has to be right: service would share the market's utility pool, so it
   * accrues on top of the utility volume already billed that month. Pricing it from zero
   * would hand a business a discount it has not earned.
   */
  const withTiers: RuleSet = {
    ...data.selectRuleSet(OCTOBER),
    serviceUsesVolumeTiers: true,
  };

  it('accrues service on top of the month’s utility volume', () => {
    const utilityVolume = 249_000;
    const serviceCharged = 2_000; // 3,000 service messages, 1,000 free by allowance

    const projection = projectMonthlyWith(withTiers, { utility: utilityVolume, service: 3_000 });
    const service = projection.categories.find((c) => c.category === 'service')!;

    expect(service.freeByAllowance).toBe(1_000);
    expect(service.chargedMessages).toBe(serviceCharged);
    // Positions 249,000..250,999: 1,000 still at list rate, then 1,000 at -5%.
    expect(service.slices.map((s) => [s.messages, s.rate])).toEqual([
      [1_000, 0.035],
      [1_000, 0.0333],
    ]);
  });

  it('would under-price the month if it started the pool from zero', () => {
    const card = data.selectRateCard('BR', 'BRL', OCTOBER);
    const fromZero = priceTieredVolume(card, 'utility', 2_000, 0);
    const stacked = priceTieredVolume(card, 'utility', 2_000, 249_000);
    expect(stacked.amountMicros).toBeLessThan(fromZero.amountMicros);
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
