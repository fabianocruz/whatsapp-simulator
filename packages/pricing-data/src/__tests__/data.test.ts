import { describe, expect, it } from 'vitest';
import {
  assertReleaseReady,
  collectDataWarnings,
  listMarkets,
  PricingDataError,
  RATE_CARDS,
  RULESETS,
  selectRateCard,
  selectRuleSet,
  toEffectiveDate,
} from '../index';

describe('ruleset selection', () => {
  it('picks the per-message ruleset through 2026-09-30', () => {
    expect(selectRuleSet('2025-07-01').id).toBe('ruleset-2025-07-01');
    expect(selectRuleSet('2026-09-30').id).toBe('ruleset-2025-07-01');
  });

  it('flips to the October ruleset on the day it takes effect', () => {
    expect(selectRuleSet('2026-10-01').id).toBe('ruleset-2026-10-01');
    expect(selectRuleSet('2030-01-01').id).toBe('ruleset-2026-10-01');
  });

  it('accepts a full ISO datetime and a Date', () => {
    expect(selectRuleSet('2026-10-01T03:00:00.000Z').id).toBe('ruleset-2026-10-01');
    expect(selectRuleSet(new Date('2026-10-01T00:00:00.000Z')).id).toBe('ruleset-2026-10-01');
  });

  it('refuses a date before the dataset starts', () => {
    expect(() => selectRuleSet('2024-01-01')).toThrow(PricingDataError);
  });

  it('refuses a malformed date instead of guessing', () => {
    expect(() => toEffectiveDate('setembro')).toThrow(PricingDataError);
    expect(() => toEffectiveDate(new Date('nope'))).toThrow(PricingDataError);
  });

  it('leaves no gap between consecutive rulesets', () => {
    const ordered = [...RULESETS].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1));
    for (let i = 0; i < ordered.length - 1; i += 1) {
      const current = ordered[i]!;
      const next = ordered[i + 1]!;
      expect(current.effectiveTo).not.toBeNull();
      const dayAfter = new Date(`${current.effectiveTo!}T00:00:00.000Z`);
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1);
      expect(dayAfter.toISOString().slice(0, 10)).toBe(next.effectiveFrom);
    }
    expect(ordered[ordered.length - 1]!.effectiveTo).toBeNull();
  });
});

describe('rate card selection', () => {
  it('is case-insensitive about the market code', () => {
    expect(selectRateCard('br', 'BRL', '2026-09-01').market).toBe('BR');
  });

  it('refuses a market it has no data for rather than falling back', () => {
    expect(() => selectRateCard('US', 'USD', '2026-09-01')).toThrow(/no rate card for market=US/);
  });

  it('refuses a date before the card takes effect', () => {
    expect(() => selectRateCard('BR', 'BRL', '2026-06-30')).toThrow(/in force/);
  });

  it('lists its markets for the UI selector', () => {
    expect(listMarkets()).toEqual([{ market: 'BR', currency: 'BRL', name: { pt: 'Brasil', en: 'Brazil' } }]);
  });
});

describe('the shipped Brazilian rate card', () => {
  const card = selectRateCard('BR', 'BRL', '2026-09-01');

  it('carries the rates the spec quotes', () => {
    expect(card.rates).toEqual({ marketing: 0.3217, utility: 0.035, authentication: 0.035 });
    expect(card.currency).toBe('BRL');
    expect(card.effectiveFrom).toBe('2026-07-01');
  });

  it('discounts utility and authentication down to -25%', () => {
    for (const table of card.volumeTiers) {
      expect(table.tiers.map((t) => t.discountPct)).toEqual([0, 5, 10, 15, 20, 25]);
      expect(table.tiers.map((t) => t.rate)).toEqual([0.035, 0.0333, 0.0315, 0.0298, 0.028, 0.0263]);
    }
  });

  it('keeps every tier table contiguous, ordered and open-ended at the top', () => {
    for (const table of card.volumeTiers) {
      expect(table.tiers[0]!.from).toBe(0);
      for (let i = 0; i < table.tiers.length - 1; i += 1) {
        const tier = table.tiers[i]!;
        expect(tier.to).not.toBeNull();
        expect(tier.to).toBe(table.tiers[i + 1]!.from);
        expect(tier.rate).toBeGreaterThan(table.tiers[i + 1]!.rate);
      }
      expect(table.tiers[table.tiers.length - 1]!.to).toBeNull();
    }
  });

  it('states every discounted rate as the published percentage off the list rate', () => {
    for (const table of card.volumeTiers) {
      const list = card.rates[table.category];
      for (const tier of table.tiers) {
        const expected = Math.round(list * (1 - tier.discountPct / 100) * 10_000) / 10_000;
        expect(tier.rate).toBe(expected);
      }
    }
  });
});

describe('verification flags', () => {
  it('marks the Brazilian tier thresholds as unverified, because they are placeholders', () => {
    const card = selectRateCard('BR', 'BRL', '2026-09-01');
    expect(card.volumeTiers.every((t) => t.tiersVerified)).toBe(false);
  });

  it('turns every unverified flag into a warning consumers can render', () => {
    const warnings = collectDataWarnings(selectRateCard('BR', 'BRL', '2026-09-01'), selectRuleSet('2026-09-01'));
    expect(warnings.map((w) => w.code)).toContain('TIERS_UNVERIFIED');
    expect(warnings.map((w) => w.code)).toContain('RATES_UNVERIFIED');
    for (const warning of warnings) {
      expect(warning.message.pt.length).toBeGreaterThan(10);
      expect(warning.message.en.length).toBeGreaterThan(10);
    }
  });

  it('blocks a release while placeholder data is still in the dataset', () => {
    // This is the guard, not a wish: flipping a verified flag without filling in the real
    // numbers is what it exists to catch. Delete this test only when the data is sourced.
    expect(() => assertReleaseReady()).toThrow(/not release-ready/);
  });

  it('gives every card and ruleset a primary source URL', () => {
    for (const card of RATE_CARDS) expect(card.sourceUrl).toMatch(/^https:\/\//);
    for (const rules of RULESETS) expect(rules.sourceUrl).toMatch(/^https:\/\//);
  });
});
