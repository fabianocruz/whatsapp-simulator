import { describe, expect, it } from 'vitest';
import { priceConversation, sortByTime } from '@dyvit/whatsapp-pricing';
import { SCENARIOS, getScenario } from '../index';

describe('bundled scenarios', () => {
  it('exposes a unique slug per scenario', () => {
    const slugs = SCENARIOS.map((s) => s.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it('throws a helpful error for an unknown slug', () => {
    expect(() => getScenario('nope')).toThrow(/available:/);
  });

  it('ships scenarios the engine prices without a single validation issue', () => {
    for (const scenario of SCENARIOS) {
      const priced = priceConversation(scenario.messages, {
        asOf: scenario.asOf,
        market: scenario.market,
        currency: scenario.currency,
      });
      expect(priced.issues, `${scenario.slug}: ${JSON.stringify(priced.issues)}`).toEqual([]);
    }
  });

  it('keeps every scenario chronological, uniquely identified and describable', () => {
    for (const scenario of SCENARIOS) {
      const ids = scenario.messages.map((m) => m.id);
      expect(new Set(ids).size, scenario.slug).toBe(ids.length);
      expect(sortByTime(scenario.messages).map((m) => m.id), scenario.slug).toEqual(ids);
      expect(scenario.name.length, scenario.slug).toBeGreaterThan(3);
      expect(scenario.description.length, scenario.slug).toBeGreaterThan(20);
    }
  });
});
