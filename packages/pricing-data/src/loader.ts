import type { Currency, LocalizedText, RateCard, RuleSet } from './types.js';

import rateCardBr20260701 from '../data/rate-cards/br-BRL/2026-07-01.json';
import ruleset20250701 from '../data/rulesets/2025-07-01.json';
import ruleset20261001 from '../data/rulesets/2026-10-01.json';

/**
 * Every shipped rate card, in no particular order — `selectRateCard` handles ordering.
 * Adding a market means dropping a JSON file in `data/rate-cards/` and one line here.
 */
export const RATE_CARDS: readonly RateCard[] = Object.freeze([
  rateCardBr20260701 as RateCard,
]);

export const RULESETS: readonly RuleSet[] = Object.freeze([
  ruleset20250701 as RuleSet,
  ruleset20261001 as RuleSet,
]);

export class PricingDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PricingDataError';
  }
}

/**
 * Normalizes an "as of" input to a YYYY-MM-DD string in UTC.
 *
 * Effective dates are calendar dates, not instants: a ruleset that starts on 2026-10-01
 * starts on that date everywhere. Comparing YYYY-MM-DD strings lexicographically is both
 * correct and timezone-proof, which comparing Date objects is not.
 */
export function toEffectiveDate(asOf: string | Date): string {
  if (asOf instanceof Date) {
    if (Number.isNaN(asOf.getTime())) throw new PricingDataError('asOf is an invalid Date');
    return asOf.toISOString().slice(0, 10);
  }
  const trimmed = asOf.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(trimmed)) {
    throw new PricingDataError(`asOf must be an ISO date or datetime, got "${asOf}"`);
  }
  return trimmed.slice(0, 10);
}

function isInForce(effectiveFrom: string, effectiveTo: string | null, date: string): boolean {
  if (date < effectiveFrom) return false;
  // effectiveTo is inclusive: a ruleset ending 2026-09-30 still applies on that day.
  if (effectiveTo !== null && date > effectiveTo) return false;
  return true;
}

/** Picks the ruleset in force on `asOf`. Throws if the date is outside every ruleset. */
export function selectRuleSet(asOf: string | Date): RuleSet {
  const date = toEffectiveDate(asOf);
  const match = RULESETS.filter((r) => isInForce(r.effectiveFrom, r.effectiveTo, date))
    // Defensive: if two rulesets ever overlap, the most recent one wins.
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  if (!match) {
    const earliest = [...RULESETS].sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? -1 : 1))[0];
    throw new PricingDataError(
      `no ruleset in force on ${date}; the dataset starts at ${earliest?.effectiveFrom ?? 'n/a'}`,
    );
  }
  return match;
}

/** Picks the rate card in force on `asOf` for a market + currency pair. */
export function selectRateCard(market: string, currency: Currency, asOf: string | Date): RateCard {
  const date = toEffectiveDate(asOf);
  const upperMarket = market.toUpperCase();
  const candidates = RATE_CARDS.filter(
    (c) => c.market.toUpperCase() === upperMarket && c.currency === currency,
  );
  if (candidates.length === 0) {
    throw new PricingDataError(
      `no rate card for market=${upperMarket} currency=${currency}; available: ${listMarkets()
        .map((m) => `${m.market}/${m.currency}`)
        .join(', ')}`,
    );
  }
  const match = candidates
    .filter((c) => isInForce(c.effectiveFrom, c.effectiveTo, date))
    .sort((a, b) => (a.effectiveFrom < b.effectiveFrom ? 1 : -1))[0];
  if (!match) {
    throw new PricingDataError(
      `no rate card for ${upperMarket}/${currency} in force on ${date}; ` +
        `known cards start at ${candidates.map((c) => c.effectiveFrom).join(', ')}`,
    );
  }
  return match;
}

/** Every market/currency pair the dataset covers, for UI selectors and SEO routes. */
export function listMarkets(): Array<{ market: string; currency: Currency; name: RateCard['marketName'] }> {
  const seen = new Map<string, { market: string; currency: Currency; name: RateCard['marketName'] }>();
  for (const card of RATE_CARDS) {
    const key = `${card.market}/${card.currency}`;
    if (!seen.has(key)) seen.set(key, { market: card.market, currency: card.currency, name: card.marketName });
  }
  return [...seen.values()];
}

export interface DataWarning {
  code: 'RATES_UNVERIFIED' | 'TIERS_UNVERIFIED' | 'RULESET_UNVERIFIED';
  subject: string;
  message: LocalizedText;
}

/**
 * Collects every "this number has no primary source yet" flag touched by a simulation.
 * The CLI prints these; the web app renders them as a banner. Never silently swallowed.
 */
export function collectDataWarnings(rateCard: RateCard, ruleSet: RuleSet): DataWarning[] {
  const warnings: DataWarning[] = [];
  if (!rateCard.ratesVerified) {
    warnings.push({
      code: 'RATES_UNVERIFIED',
      subject: `${rateCard.market}/${rateCard.currency}@${rateCard.effectiveFrom}`,
      message: {
        pt: 'Os rates deste mercado ainda nao foram conferidos contra o rate card oficial da Meta.',
        en: 'This market’s rates have not been checked against Meta’s official rate card yet.',
      },
    });
  }
  for (const table of rateCard.volumeTiers) {
    if (!table.tiersVerified) {
      warnings.push({
        code: 'TIERS_UNVERIFIED',
        subject: `${rateCard.market}/${table.category}`,
        message: {
          pt: `Os limites de volume dos tiers de ${table.category} sao placeholder, sem fonte oficial. A projecao mensal e ilustrativa.`,
          en: `The ${table.category} volume-tier thresholds are placeholders with no official source. The monthly projection is illustrative.`,
        },
      });
    }
  }
  if (!ruleSet.verified) {
    warnings.push({
      code: 'RULESET_UNVERIFIED',
      subject: ruleSet.id,
      message: {
        pt: 'Este ruleset ainda nao foi verificado contra a documentacao oficial.',
        en: 'This ruleset has not been verified against the official documentation yet.',
      },
    });
  }
  return warnings;
}

/**
 * Release gate. CI runs this so an unverified placeholder can never ship as if it were
 * a sourced number — see CONTRIBUTING.md ("contributing a rate card").
 */
export function assertReleaseReady(): void {
  const problems: string[] = [];
  for (const card of RATE_CARDS) {
    if (!card.ratesVerified) problems.push(`rate card ${card.market}/${card.currency}@${card.effectiveFrom}: ratesVerified=false`);
    for (const table of card.volumeTiers) {
      if (!table.tiersVerified) {
        problems.push(`rate card ${card.market}/${card.currency}@${card.effectiveFrom}: ${table.category} tiersVerified=false`);
      }
    }
  }
  for (const rules of RULESETS) {
    if (!rules.verified) problems.push(`ruleset ${rules.id}: verified=false`);
  }
  if (problems.length > 0) {
    throw new PricingDataError(
      `pricing data is not release-ready:\n  - ${problems.join('\n  - ')}\n` +
        'Fill in the official values and flip the verified flags, or cut the release without them.',
    );
  }
}
