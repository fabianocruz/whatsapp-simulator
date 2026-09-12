import { describe, expect, it } from 'vitest';
import type { RateCard } from '@dyvit/whatsapp-pricing-data';
import { distanceToNextTier, findTier, priceTieredVolume } from '../tiers';

/**
 * A synthetic card with round numbers. The shipped Brazilian thresholds are placeholders
 * (tiersVerified=false), so the tier *algorithm* is pinned against a fixture that will
 * not move when the official numbers land.
 */
const CARD: RateCard = {
  market: 'XX',
  marketName: { pt: 'Teste', en: 'Test' },
  callingCode: '+00',
  currency: 'BRL',
  effectiveFrom: '2026-01-01',
  effectiveTo: null,
  rates: { marketing: 1, utility: 0.1, authentication: 0.1 },
  ratesVerified: true,
  volumeTiers: [
    {
      category: 'utility',
      tiersVerified: true,
      tiers: [
        { from: 0, to: 100, discountPct: 0, rate: 0.1 },
        { from: 100, to: 300, discountPct: 10, rate: 0.09 },
        { from: 300, to: null, discountPct: 20, rate: 0.08 },
      ],
    },
  ],
  sourceUrl: 'https://example.test/rate-card',
  notes: { pt: 'fixture', en: 'fixture' },
};

describe('findTier', () => {
  it('uses half-open bounds so a threshold belongs to the tier it opens', () => {
    expect(findTier(CARD, 'utility', 99)!.index).toBe(0);
    expect(findTier(CARD, 'utility', 100)!.index).toBe(1);
    expect(findTier(CARD, 'utility', 299)!.index).toBe(1);
    expect(findTier(CARD, 'utility', 300)!.index).toBe(2);
    expect(findTier(CARD, 'utility', 10_000_000)!.index).toBe(2);
  });

  it('returns null for a category with no tier table', () => {
    expect(findTier(CARD, 'authentication', 0)).toBeNull();
  });
});

describe('priceTieredVolume', () => {
  it('charges each tier only for the messages that fall inside it', () => {
    const cost = priceTieredVolume(CARD, 'utility', 500);
    expect(cost.slices.map((s) => [s.messages, s.rate])).toEqual([
      [100, 0.1],
      [200, 0.09],
      [200, 0.08],
    ]);
    // 10 + 18 + 16 = 44, never 500 x 0.08.
    expect(cost.amountMicros).toBe(100 * 100_000 + 200 * 90_000 + 200 * 80_000);
    expect(cost.amountMicros).toBe(44_000_000);
    expect(cost.effectiveRate).toBeCloseTo(0.088, 10);
  });

  it('continues from volume already sent earlier in the month', () => {
    const first = priceTieredVolume(CARD, 'utility', 100);
    const second = priceTieredVolume(CARD, 'utility', 400, 100);
    const wholeMonth = priceTieredVolume(CARD, 'utility', 500);
    expect(first.amountMicros + second.amountMicros).toBe(wholeMonth.amountMicros);
  });

  it('falls back to the list rate when a category has no tier table', () => {
    const cost = priceTieredVolume(CARD, 'authentication', 1_000);
    expect(cost.amountMicros).toBe(1_000 * 100_000);
    expect(cost.slices).toHaveLength(1);
  });

  it('handles zero volume without inventing a slice', () => {
    const cost = priceTieredVolume(CARD, 'utility', 0);
    expect(cost.slices).toEqual([]);
    expect(cost.amountMicros).toBe(0);
  });

  it('rejects negative volume', () => {
    expect(() => priceTieredVolume(CARD, 'utility', -1)).toThrow(RangeError);
  });

  it('is monotonic: more messages never cost less', () => {
    let previous = -1;
    for (let volume = 0; volume <= 1_000; volume += 37) {
      const cost = priceTieredVolume(CARD, 'utility', volume).amountMicros;
      expect(cost).toBeGreaterThan(previous);
      previous = cost;
    }
  });

  it('splits into slices that add back up to the input volume', () => {
    for (const volume of [1, 99, 100, 101, 299, 300, 301, 12_345]) {
      const cost = priceTieredVolume(CARD, 'utility', volume);
      expect(cost.slices.reduce((sum, s) => sum + s.messages, 0)).toBe(volume);
    }
  });
});

describe('distanceToNextTier', () => {
  it('reports how far the next discount is', () => {
    const next = distanceToNextTier(CARD, 'utility', 80)!;
    expect(next.messagesAway).toBe(20);
    expect(next.nextTier.discountPct).toBe(10);
    expect(next.currentRate).toBe(0.1);
  });

  it('returns null at the top tier', () => {
    expect(distanceToNextTier(CARD, 'utility', 5_000)).toBeNull();
  });
});
