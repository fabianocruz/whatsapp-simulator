import { describe, expect, it } from 'vitest';
import { getScenario } from '@dyvit/whatsapp-scenarios';
import { compareRulesets, priceConversation } from '../price-conversation.js';
import { projectMonthly } from '../projection.js';

const CURRENT_AS_OF = '2026-09-01';
const FUTURE_AS_OF = '2026-10-01';

/**
 * Acceptance criteria from the engineering spec, section 10. These are the numbers the
 * product promises; they are asserted exactly, in micros, so a floating-point drift or a
 * silent rule change breaks the build rather than the taximeter.
 */
describe('acceptance criteria', () => {
  it('#1 — the worked example costs R$ 0,3567 today and R$ 0,4267 from 2026-10-01', () => {
    const { messages } = getScenario('worked-example-spec');

    const current = priceConversation(messages, { asOf: CURRENT_AS_OF, market: 'BR', currency: 'BRL' });
    expect(current.totalMicros).toBe(356_700);
    expect(current.total).toBe(0.3567);

    const future = priceConversation(messages, { asOf: FUTURE_AS_OF, market: 'BR', currency: 'BRL' });
    expect(future.totalMicros).toBe(426_700);
    expect(future.total).toBe(0.4267);
  });

  it('#1b — the worked example charges exactly the messages the spec table charges', () => {
    const { messages } = getScenario('worked-example-spec');
    const current = priceConversation(messages, { asOf: CURRENT_AS_OF });

    expect(current.byMessageId.m1!.reasonCode).toBe('BILLABLE_MARKETING_TEMPLATE');
    expect(current.byMessageId.m2!.reasonCode).toBe('FREE_INBOUND');
    expect(current.byMessageId.m3!.reasonCode).toBe('FREE_SERVICE');
    expect(current.byMessageId.m4!.reasonCode).toBe('FREE_IN_CSW');
    expect(current.byMessageId.m5!.reasonCode).toBe('BILLABLE_UTILITY_TEMPLATE');

    const future = priceConversation(messages, { asOf: FUTURE_AS_OF });
    expect(future.byMessageId.m3!.reasonCode).toBe('BILLABLE_SERVICE');
    expect(future.byMessageId.m4!.reasonCode).toBe('BILLABLE_UTILITY_TEMPLATE');
    expect(future.byMessageId.m5!.reasonCode).toBe('BILLABLE_UTILITY_TEMPLATE');
  });

  it('#2 — 12 mixed messages inside a 72h free entry point window cost R$ 0,00', () => {
    const { messages } = getScenario('fep-click-to-whatsapp');
    expect(messages).toHaveLength(12);

    for (const asOf of [CURRENT_AS_OF, FUTURE_AS_OF]) {
      const priced = priceConversation(messages, { asOf });
      expect(priced.totalMicros, `asOf=${asOf}`).toBe(0);
      expect(priced.billableCount, `asOf=${asOf}`).toBe(0);

      // The FEP badge has to be visible: every outbound message carries the FEP reason.
      const outbound = priced.decisions.filter((d) => d.reasonCode !== 'FREE_INBOUND');
      expect(outbound.every((d) => d.reasonCode === 'FREE_IN_FEP')).toBe(true);
      expect(outbound.every((d) => d.windowState.fepActive)).toBe(true);
      expect(outbound[0]!.windowState.fepEntryPoint).toBe('click_to_whatsapp_ad');
    }
  });

  it('#3 — 30,000 billable utility messages in a month are priced across graduated tiers', () => {
    const projection = projectMonthly({ utility: 30_000 }, { asOf: CURRENT_AS_OF, market: 'BR', currency: 'BRL' });
    const utility = projection.categories.find((c) => c.category === 'utility')!;

    // Placeholder thresholds (see the rate card's tiersVerified=false): 10k at list rate,
    // 15k at -5%, 5k at -10%. Update this expectation when the official thresholds land.
    expect(utility.slices.map((s) => [s.messages, s.rate])).toEqual([
      [10_000, 0.035],
      [15_000, 0.0333],
      [5_000, 0.0315],
    ]);
    expect(utility.amountMicros).toBe(10_000 * 35_000 + 15_000 * 33_300 + 5_000 * 31_500);
    expect(utility.amount).toBe(1007);
    expect(utility.effectiveRate).toBeCloseTo(0.0335667, 6);
  });

  it('#4 — 1,500 service messages under the 2026-10-01 ruleset: 1,000 free, 500 billed', () => {
    const projection = projectMonthly({ service: 1_500 }, { asOf: FUTURE_AS_OF, market: 'BR', currency: 'BRL' });
    const service = projection.categories.find((c) => c.category === 'service')!;

    expect(service.freeByAllowance).toBe(1_000);
    expect(service.chargedMessages).toBe(500);
    expect(service.amountMicros).toBe(500 * 35_000);
    expect(service.amount).toBe(17.5);
  });

  it('#4b — the same 1,500 service messages are free under the current ruleset', () => {
    const projection = projectMonthly({ service: 1_500 }, { asOf: CURRENT_AS_OF });
    const service = projection.categories.find((c) => c.category === 'service')!;
    expect(service.amountMicros).toBe(0);
    expect(service.freeByAllowance).toBe(1_500);
  });

  it('#4c — the allowance is granted per phone number', () => {
    const projection = projectMonthly({ service: 2_500 }, { asOf: FUTURE_AS_OF, phoneNumbers: 2 });
    const service = projection.categories.find((c) => c.category === 'service')!;
    expect(service.freeByAllowance).toBe(2_000);
    expect(service.chargedMessages).toBe(500);
  });
});

describe('ruleset comparison', () => {
  it('reports the delta the October toggle shows', () => {
    const { messages } = getScenario('worked-example-spec');
    const comparison = compareRulesets(messages, { asOf: CURRENT_AS_OF }, FUTURE_AS_OF);

    expect(comparison.deltaMicros).toBe(70_000);
    expect(comparison.delta).toBe(0.07);
    expect(comparison.multiplier).toBeCloseTo(426_700 / 356_700, 10);
  });

  it('reports a null multiplier when the conversation is free today', () => {
    const { messages } = getScenario('fep-click-to-whatsapp');
    const comparison = compareRulesets(messages, { asOf: CURRENT_AS_OF }, FUTURE_AS_OF);
    expect(comparison.multiplier).toBeNull();
    expect(comparison.deltaMicros).toBe(0);
  });
});

describe('other shipped scenarios', () => {
  it('prices the OTP scenario as three billable authentication templates', () => {
    const { messages } = getScenario('otp-authentication');
    const priced = priceConversation(messages, { asOf: CURRENT_AS_OF });
    expect(priced.billableCount).toBe(3);
    expect(priced.totalMicros).toBe(3 * 35_000);
    expect(priced.decisions.every((d) => d.reasonCode === 'BILLABLE_AUTHENTICATION_TEMPLATE')).toBe(true);
  });

  it('does not bill the failed template in the support scenario', () => {
    const { messages } = getScenario('suporte-longo');
    const priced = priceConversation(messages, { asOf: CURRENT_AS_OF });
    const failed = priced.byMessageId.m13!;
    expect(failed.billable).toBe(false);
    expect(failed.reasonCode).toBe('NOT_BILLABLE_FAILED');
  });
});
