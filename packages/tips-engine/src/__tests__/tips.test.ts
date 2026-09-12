import { describe, expect, it } from 'vitest';
import { getScenario } from '@dyvit/whatsapp-scenarios';
import { priceConversation } from '@dyvit/whatsapp-pricing';
import type { SimMessage } from '@dyvit/whatsapp-pricing';
import { analyzeConversation, generateTips, TIP_RULES } from '../index';

const TODAY = '2026-09-01';
const OCTOBER = '2026-10-01';

function analyze(slug: string, extra: { conversationsPerMonth?: number; phoneNumbers?: number } = {}) {
  const scenario = getScenario(slug);
  return analyzeConversation(scenario.messages, { asOf: TODAY, market: 'BR', currency: 'BRL', ...extra });
}

const ids = (tips: ReturnType<typeof generateTips>) => tips.map((t) => t.ruleId);

describe('the catalogue', () => {
  it('ships all ten rules from the spec', () => {
    expect(TIP_RULES).toHaveLength(10);
  });

  it('gives every tip copy in both languages and a non-negative saving', () => {
    for (const slug of ['worked-example-spec', 'suporte-longo', 'otp-authentication', 'fep-click-to-whatsapp']) {
      for (const tip of analyze(slug, { conversationsPerMonth: 30_000 }).tips) {
        expect(tip.titlePt.length, `${slug}/${tip.ruleId}`).toBeGreaterThan(5);
        expect(tip.titleEn.length, `${slug}/${tip.ruleId}`).toBeGreaterThan(5);
        expect(tip.textPt.length, `${slug}/${tip.ruleId}`).toBeGreaterThan(20);
        expect(tip.textEn.length, `${slug}/${tip.ruleId}`).toBeGreaterThan(20);
        expect(tip.estimatedSavingMicros, `${slug}/${tip.ruleId}`).toBeGreaterThanOrEqual(0);
        expect(tip.currency).toBe('BRL');
      }
    }
  });

  it('sorts the most valuable advice first', () => {
    const tips = analyze('suporte-longo', { conversationsPerMonth: 1_000 }).tips;
    const savings = tips.map((t) => t.estimatedSavingMicros);
    expect([...savings].sort((a, b) => b - a)).toEqual(savings);
  });

  it('points every tip at message ids that exist in the conversation', () => {
    const scenario = getScenario('suporte-longo');
    const known = new Set(scenario.messages.map((m) => m.id));
    for (const tip of analyze('suporte-longo', { conversationsPerMonth: 1_000 }).tips) {
      for (const id of tip.triggeredBy) expect(known.has(id), `${tip.ruleId} -> ${id}`).toBe(true);
    }
  });
});

describe('T1 — consolidate replies', () => {
  it('fires on consecutive service replies and prices the messages it would remove', () => {
    const tips = analyze('suporte-longo').tips;
    const t1 = tips.find((t) => t.ruleId === 'T1')!;
    // Runs of 3 (m2..m4), 3 (m6..m8) and 1 (m10, not a run) -> 4 removable messages.
    expect(t1.estimatedSavingMicros).toBe(4 * 35_000);
  });

  it('stays quiet when replies are separated by customer messages', () => {
    expect(ids(analyze('worked-example-spec').tips)).not.toContain('T1');
  });
});

describe('T2 — reorder into the window', () => {
  it('fires on a utility template billed after the window closed', () => {
    const t2 = analyze('worked-example-spec').tips.find((t) => t.ruleId === 'T2')!;
    expect(t2.estimatedSavingMicros).toBe(35_000);
  });

  it('stops firing once the in-window exemption expires', () => {
    const scenario = getScenario('worked-example-spec');
    const result = analyzeConversation(scenario.messages, { asOf: OCTOBER });
    expect(ids(result.tips)).not.toContain('T2');
  });
});

describe('T3 — suspected miscategory', () => {
  it('flags a marketing template whose copy reads transactional', () => {
    const messages: SimMessage[] = [
      {
        id: 'a1',
        direction: 'business_to_user',
        kind: 'template',
        category: 'marketing',
        sentAt: '2026-09-01T10:00:00.000Z',
        status: 'delivered',
        bodyPreview: 'Seu pedido #4812 saiu para entrega.',
      },
    ];
    const tip = analyzeConversation(messages, { asOf: TODAY }).tips.find((t) => t.ruleId === 'T3')!;
    expect(tip.estimatedSavingMicros).toBe(321_700 - 35_000);
    expect(tip.triggeredBy).toEqual(['a1']);
  });

  it('leaves an actual promotion alone', () => {
    const messages: SimMessage[] = [
      {
        id: 'a1',
        direction: 'business_to_user',
        kind: 'template',
        category: 'marketing',
        sentAt: '2026-09-01T10:00:00.000Z',
        status: 'delivered',
        bodyPreview: 'Promocao de setembro: 20% off no seu pedido.',
      },
    ];
    expect(ids(analyzeConversation(messages, { asOf: TODAY }).tips)).not.toContain('T3');
  });
});

describe('T4 — free entry point', () => {
  it('offers the whole conversation cost as the saving when there is no CTWA entry', () => {
    const result = analyze('worked-example-spec');
    const t4 = result.tips.find((t) => t.ruleId === 'T4')!;
    expect(t4.estimatedSavingMicros).toBe(result.priced.totalMicros);
  });

  it('stays quiet when the conversation already came through an ad', () => {
    expect(ids(analyze('fep-click-to-whatsapp').tips)).not.toContain('T4');
  });

  it('stays quiet when the conversation is already free', () => {
    const messages = getScenario('worked-example-spec').messages.filter((m) => m.id !== 'm1' && m.id !== 'm5');
    expect(ids(analyzeConversation(messages, { asOf: TODAY }).tips)).not.toContain('T4');
  });
});

describe('T5 — collect with Flows', () => {
  it('fires on three or more question-shaped service messages', () => {
    const t5 = analyze('suporte-longo').tips.find((t) => t.ruleId === 'T5')!;
    // m3, m4, m6, m7, m8 end in a question mark -> 5 questions, 4 removable.
    expect(t5.estimatedSavingMicros).toBe(4 * 35_000);
  });

  it('stays quiet on a conversation with no data collection', () => {
    expect(ids(analyze('otp-authentication').tips)).not.toContain('T5');
  });
});

describe('T6 — near the next tier', () => {
  it('fires when projected volume sits just under a threshold', () => {
    // 1 billable utility per conversation x 9,500 conversations = 9,500 utility messages,
    // 500 short of the placeholder 10,000 threshold (within 10% of it).
    const scenario = getScenario('worked-example-spec');
    const result = analyzeConversation(scenario.messages, { asOf: TODAY, conversationsPerMonth: 9_500 });
    const t6 = result.tips.find((t) => t.ruleId === 'T6')!;
    expect(t6.titlePt).toContain('500 mensagens');
    expect(t6.estimatedSavingMicros).toBe((35_000 - 33_300) * 9_500);
  });

  it('stays quiet when volume is nowhere near a threshold', () => {
    const scenario = getScenario('worked-example-spec');
    const result = analyzeConversation(scenario.messages, { asOf: TODAY, conversationsPerMonth: 100 });
    expect(ids(result.tips)).not.toContain('T6');
  });

  it('stays quiet with no monthly volume given', () => {
    expect(ids(analyze('worked-example-spec').tips)).not.toContain('T6');
  });
});

describe('T7 — failed messages', () => {
  it('warns without claiming a saving', () => {
    const t7 = analyze('suporte-longo').tips.find((t) => t.ruleId === 'T7')!;
    expect(t7.severity).toBe('risk');
    expect(t7.estimatedSavingMicros).toBe(0);
    expect(t7.triggeredBy).toEqual(['m13']);
  });
});

describe('T8 — service allowance', () => {
  it('fires once projected service volume passes 1,000 per number', () => {
    // The worked example bills one service message per conversation under October rules.
    const scenario = getScenario('worked-example-spec');
    const result = analyzeConversation(scenario.messages, { asOf: TODAY, conversationsPerMonth: 1_500 });
    const t8 = result.tips.find((t) => t.ruleId === 'T8')!;
    expect(t8.estimatedSavingMicros).toBe(500 * 35_000);
  });

  it('accounts for the allowance being granted per phone number', () => {
    const scenario = getScenario('worked-example-spec');
    const result = analyzeConversation(scenario.messages, {
      asOf: TODAY,
      conversationsPerMonth: 1_500,
      phoneNumbers: 2,
    });
    expect(ids(result.tips)).not.toContain('T8');
  });
});

describe('T10 — October comparison', () => {
  it('quantifies the delta between the two rulesets', () => {
    const t10 = analyze('worked-example-spec').tips.find((t) => t.ruleId === 'T10')!;
    expect(t10.estimatedSavingMicros).toBe(70_000);
    expect(t10.textPt).toContain('1,20x');
  });

  it('stays quiet when the rules change nothing for this conversation', () => {
    expect(ids(analyze('otp-authentication').tips)).not.toContain('T10');
    expect(ids(analyze('fep-click-to-whatsapp').tips)).not.toContain('T10');
  });
});

describe('generateTips', () => {
  it('handles an empty conversation without inventing advice', () => {
    const priced = priceConversation([], { asOf: TODAY });
    expect(generateTips({ priced, future: priced, messages: [] })).toEqual([]);
  });
});
