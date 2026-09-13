import { describe, expect, it } from 'vitest';
import { getScenario } from '@dyvit/whatsapp-scenarios';
import { compareRulesets, priceConversation } from '../price-conversation';
import { projectMonthly, volumeFromConversation } from '../projection';

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

  it('#3 — 30,000 billable utility messages in a month are priced through the tier table', () => {
    const projection = projectMonthly({ utility: 30_000 }, { asOf: CURRENT_AS_OF, market: 'BR', currency: 'BRL' });
    const utility = projection.categories.find((c) => c.category === 'utility')!;

    // The spec wrote this criterion against placeholder thresholds. Meta's real first
    // utility tier runs to 250,000 messages, so 30,000 sits entirely inside it and the
    // correct answer is the flat list rate. The tier table is still what produced it.
    expect(utility.slices.map((s) => [s.messages, s.rate])).toEqual([[30_000, 0.035]]);
    expect(utility.amountMicros).toBe(30_000 * 35_000);
    expect(utility.amount).toBe(1050);
    expect(utility.effectiveRate).toBe(0.035);
  });

  it('#3b — 3,000,000 utility messages are split across the first three real tiers', () => {
    const projection = projectMonthly({ utility: 3_000_000 }, { asOf: CURRENT_AS_OF, market: 'BR', currency: 'BRL' });
    const utility = projection.categories.find((c) => c.category === 'utility')!;

    expect(utility.slices.map((s) => [s.messages, s.rate])).toEqual([
      [250_000, 0.035],
      [1_750_000, 0.0333],
      [1_000_000, 0.0315],
    ]);
    // Graduated, not cliff-based: 98,525 rather than 3,000,000 x 0.0315 = 94,500.
    expect(utility.amountMicros).toBe(250_000 * 35_000 + 1_750_000 * 33_300 + 1_000_000 * 31_500);
    expect(utility.amount).toBe(98_525);
    expect(utility.effectiveRate).toBeCloseTo(0.0328417, 6);
  });

  it('#3c — authentication reaches each discount later than utility', () => {
    // Same 3,000,000 messages, different category: authentication's first tier runs to
    // 500,000 and its second to 3,000,000, so it never reaches the -10% rate here.
    const projection = projectMonthly(
      { authentication: 3_000_000 },
      { asOf: CURRENT_AS_OF, market: 'BR', currency: 'BRL' },
    );
    const auth = projection.categories.find((c) => c.category === 'authentication')!;

    expect(auth.slices.map((s) => [s.messages, s.rate])).toEqual([
      [500_000, 0.035],
      [2_500_000, 0.0333],
    ]);
    expect(auth.amountMicros).toBe(500_000 * 35_000 + 2_500_000 * 33_300);
    expect(auth.amount).toBe(100_750);
    // Cheaper for utility than for authentication at identical volume.
    expect(auth.amountMicros).toBeGreaterThan(98_525_000_000);
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

/**
 * O par que mede quanto um Flow economiza.
 *
 * A mesma jornada de remarcação, com o mesmo desfecho para o cliente, resolvida de duas
 * formas: pergunta a pergunta, e num Flow só. É uma afirmação que o projeto faz em
 * público, sobre dinheiro de terceiros, então fica presa aqui.
 *
 * O ponto que o número sozinho não conta: hoje as duas custam exatamente zero. Flow não
 * é otimização de custo agora, e vira uma em 01/10/2026.
 */
describe('Flow contra a jornada pergunta a pergunta', () => {
  const semFlow = getScenario('remarcacao-sem-flow');
  const comFlow = getScenario('remarcacao-com-flow');

  it('hoje não faz diferença nenhuma: as duas são grátis', () => {
    for (const scenario of [semFlow, comFlow]) {
      const priced = priceConversation(scenario.messages, { asOf: CURRENT_AS_OF });
      expect(priced.totalMicros, scenario.slug).toBe(0);
      expect(priced.billableCount, scenario.slug).toBe(0);
    }
  });

  it('em 01/10/2026 o Flow custa um terço', () => {
    const sem = priceConversation(semFlow.messages, { asOf: FUTURE_AS_OF });
    const com = priceConversation(comFlow.messages, { asOf: FUTURE_AS_OF });

    // Seis mensagens de service contra duas: cinco perguntas mais a confirmação, contra o
    // Flow mais a confirmação.
    expect(sem.billableCount).toBe(6);
    expect(com.billableCount).toBe(2);
    expect(sem.totalMicros).toBe(6 * 35_000);
    expect(com.totalMicros).toBe(2 * 35_000);
    expect(com.totalMicros / sem.totalMicros).toBeCloseTo(1 / 3, 10);
  });

  it('a resposta do Flow não é cobrada, porque vem do cliente', () => {
    const com = priceConversation(comFlow.messages, { asOf: FUTURE_AS_OF });
    const resposta = com.decisions.find((d) => d.messageId === 'm3')!;
    expect(resposta.reasonCode).toBe('FREE_INBOUND');
    expect(resposta.billable).toBe(false);
  });

  it('a diferença aparece na projeção mensal, com a franquia aplicada', () => {
    const sem = projectMonthly(
      volumeFromConversation(priceConversation(semFlow.messages, { asOf: FUTURE_AS_OF }), 50_000),
      { asOf: FUTURE_AS_OF },
    );
    const com = projectMonthly(
      volumeFromConversation(priceConversation(comFlow.messages, { asOf: FUTURE_AS_OF }), 50_000),
      { asOf: FUTURE_AS_OF },
    );

    // 300.000 contra 100.000 mensagens de service, menos as 1.000 da franquia em cada.
    expect(sem.total).toBe(10_465);
    expect(com.total).toBe(3_465);
    expect(sem.total - com.total).toBe(7_000);
  });
});
