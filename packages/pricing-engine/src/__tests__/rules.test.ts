import { describe, expect, it } from 'vitest';
import type { SimMessage } from '../types';
import { priceConversation } from '../price-conversation';

const BASE = Date.UTC(2026, 8, 1, 9, 0, 0);
const at = (hours: number) => new Date(BASE + hours * 3_600_000).toISOString();
const TODAY = '2026-09-01';
const OCTOBER = '2026-10-01';

let seq = 0;
function message(partial: Partial<SimMessage> & Pick<SimMessage, 'direction' | 'kind' | 'category'>): SimMessage {
  seq += 1;
  return {
    id: partial.id ?? `m${seq}`,
    sentAt: partial.sentAt ?? at(0),
    status: partial.status ?? 'delivered',
    ...partial,
  } as SimMessage;
}

const inbound = (hours: number, extra: Partial<SimMessage> = {}) =>
  message({ direction: 'user_to_business', kind: 'non_template', category: 'service', sentAt: at(hours), ...extra });
const template = (hours: number, category: 'marketing' | 'utility' | 'authentication', extra: Partial<SimMessage> = {}) =>
  message({ direction: 'business_to_user', kind: 'template', category, sentAt: at(hours), ...extra });
const service = (hours: number, extra: Partial<SimMessage> = {}) =>
  message({ direction: 'business_to_user', kind: 'non_template', category: 'service', sentAt: at(hours), ...extra });

describe('R1 — inbound', () => {
  it('never bills a customer message, whatever the ruleset', () => {
    for (const asOf of [TODAY, OCTOBER]) {
      const priced = priceConversation([inbound(0)], { asOf });
      expect(priced.totalMicros).toBe(0);
      expect(priced.decisions[0]!.reasonCode).toBe('FREE_INBOUND');
    }
  });
});

describe('R2 — delivery gates the charge', () => {
  it.each([
    ['delivered', true],
    ['read', true],
    ['sent', false],
    ['failed', false],
  ] as const)('status %s -> billable %s', (status, billable) => {
    const priced = priceConversation([template(0, 'marketing', { status })], { asOf: TODAY });
    expect(priced.decisions[0]!.billable).toBe(billable);
  });

  it('reports failed separately from merely-undelivered', () => {
    const priced = priceConversation([template(0, 'marketing', { status: 'failed' }), template(1, 'marketing', { status: 'sent' })], {
      asOf: TODAY,
    });
    expect(priced.decisions[0]!.reasonCode).toBe('NOT_BILLABLE_FAILED');
    expect(priced.decisions[1]!.reasonCode).toBe('NOT_BILLABLE_NOT_DELIVERED');
  });
});

describe('R3 — marketing', () => {
  it('bills inside the window just the same as outside it', () => {
    const inWindow = priceConversation([inbound(0), template(1, 'marketing')], { asOf: TODAY });
    const outOfWindow = priceConversation([template(1, 'marketing')], { asOf: TODAY });
    expect(inWindow.totalMicros).toBe(321_700);
    expect(outOfWindow.totalMicros).toBe(321_700);
  });
});

describe('R4 — utility', () => {
  it('is free inside the window today and billed from October', () => {
    const timeline = [inbound(0), template(1, 'utility')];
    expect(priceConversation(timeline, { asOf: TODAY }).totalMicros).toBe(0);
    expect(priceConversation(timeline, { asOf: OCTOBER }).totalMicros).toBe(35_000);
  });

  it('is billed outside the window under both rulesets', () => {
    const timeline = [inbound(0), template(30, 'utility')];
    expect(priceConversation(timeline, { asOf: TODAY }).totalMicros).toBe(35_000);
    expect(priceConversation(timeline, { asOf: OCTOBER }).totalMicros).toBe(35_000);
  });
});

describe('R5 — authentication', () => {
  it('is billed even inside an open window', () => {
    const priced = priceConversation([inbound(0), template(1, 'authentication')], { asOf: TODAY });
    expect(priced.totalMicros).toBe(35_000);
  });
});

describe('R6 — service', () => {
  it('is free today and billed at the utility rate from October', () => {
    const timeline = [inbound(0), service(1)];
    expect(priceConversation(timeline, { asOf: TODAY }).totalMicros).toBe(0);
    expect(priceConversation(timeline, { asOf: OCTOBER }).totalMicros).toBe(35_000);
  });

  it('flags a non-template sent outside the window instead of pricing it', () => {
    const priced = priceConversation([inbound(0), service(30)], { asOf: OCTOBER });
    const decision = priced.decisions[1]!;
    expect(decision.reasonCode).toBe('INVALID_NON_TEMPLATE_OUTSIDE_CSW');
    expect(decision.billable).toBe(false);
    expect(priced.totalMicros).toBe(0);
  });

  it('never claims the allowance ran out when the allowance was never consulted', () => {
    // The October toggle is the teaching moment of the product; telling a first-time user
    // that their 1,000-message allowance is "already used up" on their first simulated
    // conversation is the opposite of teaching.
    const listRate = priceConversation([inbound(0), service(1)], { asOf: OCTOBER }).decisions[1]!;
    expect(listRate.reasonCode).toBe('BILLABLE_SERVICE');
    expect(listRate.explanation.pt).toContain('rate de lista');
    expect(listRate.explanation.pt).toContain('projecao mensal');
    expect(listRate.explanation.pt).not.toContain('consumida');
    expect(listRate.explanation.en).toContain('list rate');
    expect(listRate.explanation.en).not.toContain('used up');

    const exhausted = priceConversation([inbound(0), service(1)], {
      asOf: OCTOBER,
      monthlyContext: { serviceMessagesUsedThisMonth: 1_000 },
    }).decisions[1]!;
    expect(exhausted.reasonCode).toBe('BILLABLE_SERVICE');
    expect(exhausted.explanation.pt).toContain('consumida');
    expect(exhausted.explanation.en).toContain('used up');
    // Same rule, same charge — only the explanation differs.
    expect(exhausted.amountMicros).toBe(listRate.amountMicros);
  });

  it('consumes the monthly allowance only when a monthly context is supplied', () => {
    const timeline = [inbound(0), service(1)];

    // Default: list rate, so a shared link prices the same for everyone.
    expect(priceConversation(timeline, { asOf: OCTOBER }).decisions[1]!.reasonCode).toBe('BILLABLE_SERVICE');

    // With a monthly context, the allowance applies.
    const withAllowance = priceConversation(timeline, {
      asOf: OCTOBER,
      monthlyContext: { serviceMessagesUsedThisMonth: 0 },
    });
    expect(withAllowance.decisions[1]!.reasonCode).toBe('FREE_SERVICE_ALLOWANCE');
    expect(withAllowance.totalMicros).toBe(0);

    const exhausted = priceConversation(timeline, {
      asOf: OCTOBER,
      monthlyContext: { serviceMessagesUsedThisMonth: 1_000 },
    });
    expect(exhausted.decisions[1]!.reasonCode).toBe('BILLABLE_SERVICE');
    expect(exhausted.totalMicros).toBe(35_000);
  });
});

describe('R7 — free entry point beats every category rule', () => {
  it('zeroes a marketing template that would otherwise always be billed', () => {
    const priced = priceConversation(
      [inbound(0, { entryPoint: 'click_to_whatsapp_ad' }), service(1), template(2, 'marketing')],
      { asOf: TODAY },
    );
    expect(priced.totalMicros).toBe(0);
    expect(priced.byMessageId[priced.decisions[2]!.messageId]!.reasonCode).toBe('FREE_IN_FEP');
  });

  it('bills again once the 72h window lapses', () => {
    const priced = priceConversation(
      [inbound(0, { entryPoint: 'click_to_whatsapp_ad' }), service(1), template(80, 'marketing')],
      { asOf: TODAY },
    );
    expect(priced.totalMicros).toBe(321_700);
  });
});

describe('R8 — volume tiers inside a conversation', () => {
  it('stays at the list rate without a monthly context', () => {
    const priced = priceConversation([template(0, 'utility'), template(1, 'utility')], { asOf: TODAY });
    expect(priced.decisions.every((d) => d.unitRate === 0.035)).toBe(true);
    expect(priced.decisions.every((d) => d.tierApplied === null)).toBe(true);
  });

  it('applies the tier the business is already in, and advances within the conversation', () => {
    const priced = priceConversation([template(0, 'utility'), template(1, 'utility')], {
      asOf: TODAY,
      monthlyContext: { billableVolumeThisMonth: { utility: 249_999 } },
    });
    expect(priced.decisions[0]!.unitRate).toBe(0.035);
    expect(priced.decisions[0]!.tierApplied).toBe(0);
    // Meta's first utility tier ends at 250,000 messages; the next one crosses into -5%.
    expect(priced.decisions[1]!.unitRate).toBe(0.0333);
    expect(priced.decisions[1]!.tierApplied).toBe(1);
  });

  it('uses the authentication table for authentication, not the utility one', () => {
    // 250,000 is past utility's first threshold but well inside authentication's, which
    // runs to 500,000. Sharing one table between the categories would misprice this.
    const priced = priceConversation([template(0, 'authentication')], {
      asOf: TODAY,
      monthlyContext: { billableVolumeThisMonth: { authentication: 250_000 } },
    });
    expect(priced.decisions[0]!.unitRate).toBe(0.035);
    expect(priced.decisions[0]!.tierApplied).toBe(0);
  });
});

describe('trace completeness', () => {
  it('carries ruleset, rule id, source and both languages on every decision', () => {
    const priced = priceConversation([inbound(0), template(1, 'utility'), template(30, 'utility')], { asOf: TODAY });
    for (const decision of priced.decisions) {
      expect(decision.rulesetVersion).toBe('ruleset-2025-07-01');
      expect(decision.effectiveAt).toBe('2025-07-01');
      expect(decision.ruleId).toMatch(/^R\d_/);
      expect(decision.sourceUrl).toMatch(/^https:\/\//);
      expect(decision.explanation.pt.length).toBeGreaterThan(10);
      expect(decision.explanation.en.length).toBeGreaterThan(10);
      expect(decision.market).toBe('BR');
      expect(decision.currency).toBe('BRL');
    }
  });

  it('breaks the total down by category', () => {
    const priced = priceConversation(
      [template(0, 'marketing'), inbound(1), template(2, 'authentication'), template(40, 'utility')],
      { asOf: TODAY },
    );
    const byCategory = Object.fromEntries(priced.breakdown.map((b) => [b.category, b.amountMicros]));
    expect(byCategory.marketing).toBe(321_700);
    expect(byCategory.authentication).toBe(35_000);
    expect(byCategory.utility).toBe(35_000);
    expect(byCategory.service).toBe(0);
    expect(priced.totalMicros).toBe(391_700);
  });

  it('never mutates the caller’s array', () => {
    const timeline = [template(5, 'marketing'), inbound(0)];
    const snapshot = JSON.stringify(timeline);
    priceConversation(timeline, { asOf: TODAY });
    expect(JSON.stringify(timeline)).toBe(snapshot);
  });
});

describe('as-of selection', () => {
  it('picks the ruleset by date, not by the message timestamps', () => {
    const timeline = [inbound(0), service(1)];
    expect(priceConversation(timeline, { asOf: '2026-09-30' }).ruleSet.id).toBe('ruleset-2025-07-01');
    expect(priceConversation(timeline, { asOf: '2026-10-01' }).ruleSet.id).toBe('ruleset-2026-10-01');
  });

  it('rejects a date with no rate card', () => {
    expect(() => priceConversation([inbound(0)], { asOf: '2026-01-01' })).toThrow(/rate card/);
  });

  it('rejects an unknown market', () => {
    expect(() => priceConversation([inbound(0)], { asOf: TODAY, market: 'ZZ' })).toThrow(/no rate card/);
  });
});
