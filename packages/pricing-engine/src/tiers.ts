import type { RateCard, VolumeTier, TieredCategory } from '@dyvit/whatsapp-pricing-data';
import { toMicros } from './money.js';

export interface TierLookup {
  tier: VolumeTier;
  index: number;
}

/**
 * Finds the tier a given cumulative volume position falls into.
 *
 * `position` is 0-based: the first billable message of the month sits at position 0.
 * Returns null when the card has no tier table for the category (marketing, for one,
 * has no volume discount at all).
 */
export function findTier(rateCard: RateCard, category: TieredCategory, position: number): TierLookup | null {
  const table = rateCard.volumeTiers.find((t) => t.category === category);
  if (!table) return null;
  for (let index = 0; index < table.tiers.length; index += 1) {
    const tier = table.tiers[index]!;
    if (position >= tier.from && (tier.to === null || position < tier.to)) {
      return { tier, index };
    }
  }
  return null;
}

export interface TierSlice {
  tierIndex: number;
  discountPct: number;
  rate: number;
  messages: number;
  amountMicros: number;
}

export interface TieredVolumeCost {
  category: TieredCategory;
  messages: number;
  slices: TierSlice[];
  amountMicros: number;
  /** Blended per-message rate across every slice, for the "your average falls to X" copy. */
  effectiveRate: number;
}

/**
 * Prices `messages` billable messages of one category under graduated volume tiers.
 *
 * Graduated, not cliff-based: Meta applies each tier's rate to the messages that fall
 * inside that tier, the way income tax brackets work. 30,000 utility messages therefore
 * cost tier0 rate x tier0 count + tier1 rate x tier1 count + ..., not 30,000 x tier2 rate.
 *
 * `alreadySentThisMonth` shifts the starting position so a second batch continues where
 * the first one stopped.
 */
export function priceTieredVolume(
  rateCard: RateCard,
  category: TieredCategory,
  messages: number,
  alreadySentThisMonth = 0,
): TieredVolumeCost {
  if (messages < 0) throw new RangeError(`messages must be >= 0, got ${messages}`);
  const table = rateCard.volumeTiers.find((t) => t.category === category);
  const listRate = rateCard.rates[category];

  if (!table || table.tiers.length === 0) {
    const amountMicros = toMicros(listRate) * messages;
    return {
      category,
      messages,
      slices: messages > 0 ? [{ tierIndex: 0, discountPct: 0, rate: listRate, messages, amountMicros }] : [],
      amountMicros,
      effectiveRate: listRate,
    };
  }

  const slices: TierSlice[] = [];
  let remaining = messages;
  let position = alreadySentThisMonth;
  let amountMicros = 0;

  while (remaining > 0) {
    const lookup = findTier(rateCard, category, position);
    if (!lookup) {
      // Volume ran past the top of the table: the last tier is the floor rate.
      const last = table.tiers[table.tiers.length - 1]!;
      const sliceMicros = toMicros(last.rate) * remaining;
      slices.push({
        tierIndex: table.tiers.length - 1,
        discountPct: last.discountPct,
        rate: last.rate,
        messages: remaining,
        amountMicros: sliceMicros,
      });
      amountMicros += sliceMicros;
      break;
    }
    const { tier, index } = lookup;
    const capacity = tier.to === null ? remaining : Math.min(remaining, tier.to - position);
    const sliceMicros = toMicros(tier.rate) * capacity;
    slices.push({
      tierIndex: index,
      discountPct: tier.discountPct,
      rate: tier.rate,
      messages: capacity,
      amountMicros: sliceMicros,
    });
    amountMicros += sliceMicros;
    remaining -= capacity;
    position += capacity;
  }

  return {
    category,
    messages,
    slices,
    amountMicros,
    effectiveRate: messages === 0 ? listRate : amountMicros / messages / 1_000_000,
  };
}

/**
 * Messages still to go before the next tier kicks in, and what that tier would save.
 * Returns null at the top tier or when the card has no table for the category.
 */
export function distanceToNextTier(
  rateCard: RateCard,
  category: TieredCategory,
  currentVolume: number,
): { messagesAway: number; nextTier: VolumeTier; nextTierIndex: number; currentRate: number } | null {
  const table = rateCard.volumeTiers.find((t) => t.category === category);
  if (!table) return null;
  const current = findTier(rateCard, category, currentVolume);
  if (!current) return null;
  const nextTierIndex = current.index + 1;
  const nextTier = table.tiers[nextTierIndex];
  if (!nextTier) return null;
  return {
    messagesAway: nextTier.from - currentVolume,
    nextTier,
    nextTierIndex,
    currentRate: current.tier.rate,
  };
}
