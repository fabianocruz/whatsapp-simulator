import { collectDataWarnings, selectRateCard, selectRuleSet, toEffectiveDate } from '@dyvit/whatsapp-pricing-data';
import type { DataWarning, RateCard, RuleSet } from '@dyvit/whatsapp-pricing-data';
import { fromMicros, toMicros } from './money.js';
import { priceTieredVolume, type TierSlice } from './tiers.js';
import type { Category, Currency, PricedConversation } from './types.js';

export type VolumeByCategory = Record<Category, number>;

export interface MonthlyProjectionOptions {
  asOf: string | Date;
  market?: string;
  currency?: Currency;
  /**
   * Phone numbers the volume is spread across. The service allowance is granted per
   * number, so two numbers carry 2,000 free service messages between them.
   */
  phoneNumbers?: number;
}

export interface ProjectedCategory {
  category: Category;
  /** Billable messages fed in (free-by-rule messages should never reach here). */
  messages: number;
  /** Messages covered by the monthly service allowance. */
  freeByAllowance: number;
  chargedMessages: number;
  slices: TierSlice[];
  amountMicros: number;
  amount: number;
  /** Blended per-message cost across the month, allowance included. */
  effectiveRate: number;
}

export interface MonthlyProjection {
  ruleSet: RuleSet;
  rateCard: RateCard;
  market: string;
  currency: Currency;
  asOf: string;
  phoneNumbers: number;
  categories: ProjectedCategory[];
  totalMicros: number;
  total: number;
  warnings: DataWarning[];
}

function emptyVolume(): VolumeByCategory {
  return { marketing: 0, utility: 0, authentication: 0, service: 0 };
}

/**
 * Prices a month of billable volume: graduated volume tiers for utility and
 * authentication, the 1,000-per-number service allowance, flat rate for marketing.
 *
 * Only messages that the per-message rules would actually charge belong in `volumes` —
 * Meta counts billed messages toward tiers, not free ones. `volumeFromConversation` does
 * that filtering for you.
 */
export function projectMonthly(
  volumes: Partial<VolumeByCategory>,
  options: MonthlyProjectionOptions,
): MonthlyProjection {
  const market = (options.market ?? 'BR').toUpperCase();
  const currency = options.currency ?? 'BRL';
  const asOf = toEffectiveDate(options.asOf);
  const phoneNumbers = Math.max(1, Math.floor(options.phoneNumbers ?? 1));

  const ruleSet = selectRuleSet(asOf);
  const rateCard = selectRateCard(market, currency, asOf);
  const input: VolumeByCategory = { ...emptyVolume(), ...volumes };

  const categories: ProjectedCategory[] = [];

  if (input.marketing > 0) {
    const amountMicros = toMicros(rateCard.rates.marketing) * input.marketing;
    categories.push({
      category: 'marketing',
      messages: input.marketing,
      freeByAllowance: 0,
      chargedMessages: input.marketing,
      slices: [
        {
          tierIndex: 0,
          discountPct: 0,
          rate: rateCard.rates.marketing,
          messages: input.marketing,
          amountMicros,
        },
      ],
      amountMicros,
      amount: fromMicros(amountMicros),
      effectiveRate: rateCard.rates.marketing,
    });
  }

  for (const category of ['utility', 'authentication'] as const) {
    const messages = input[category];
    if (messages <= 0) continue;
    const cost = priceTieredVolume(rateCard, category, messages);
    categories.push({
      category,
      messages,
      freeByAllowance: 0,
      chargedMessages: messages,
      slices: cost.slices,
      amountMicros: cost.amountMicros,
      amount: fromMicros(cost.amountMicros),
      effectiveRate: cost.effectiveRate,
    });
  }

  if (input.service > 0) {
    // Service is free entirely until the ruleset flips it on.
    if (!ruleSet.serviceMessagesBillable) {
      categories.push({
        category: 'service',
        messages: input.service,
        freeByAllowance: input.service,
        chargedMessages: 0,
        slices: [],
        amountMicros: 0,
        amount: 0,
        effectiveRate: 0,
      });
    } else {
      const allowance = ruleSet.serviceFreeAllowancePerMonth * phoneNumbers;
      const freeByAllowance = Math.min(input.service, allowance);
      const chargedMessages = input.service - freeByAllowance;
      const cost = ruleSet.serviceUsesVolumeTiers
        ? priceTieredVolume(rateCard, 'utility', chargedMessages)
        : {
            slices: chargedMessages
              ? [
                  {
                    tierIndex: 0,
                    discountPct: 0,
                    rate: rateCard.rates.utility,
                    messages: chargedMessages,
                    amountMicros: toMicros(rateCard.rates.utility) * chargedMessages,
                  },
                ]
              : [],
            amountMicros: toMicros(rateCard.rates.utility) * chargedMessages,
          };
      categories.push({
        category: 'service',
        messages: input.service,
        freeByAllowance,
        chargedMessages,
        slices: cost.slices,
        amountMicros: cost.amountMicros,
        amount: fromMicros(cost.amountMicros),
        effectiveRate: input.service === 0 ? 0 : cost.amountMicros / input.service / 1_000_000,
      });
    }
  }

  const totalMicros = categories.reduce((sum, c) => sum + c.amountMicros, 0);

  return {
    ruleSet,
    rateCard,
    market,
    currency,
    asOf,
    phoneNumbers,
    categories,
    totalMicros,
    total: fromMicros(totalMicros),
    warnings: collectDataWarnings(rateCard, ruleSet),
  };
}

/**
 * Scales one priced conversation into a month of volume.
 *
 * Counts only the messages the per-message rules actually charged: a utility template
 * that was free inside the window does not count toward a volume tier, and neither does
 * anything inside a free entry point window.
 */
export function volumeFromConversation(
  priced: PricedConversation,
  conversationsPerMonth: number,
): VolumeByCategory {
  const perConversation = emptyVolume();
  for (const decision of priced.decisions) {
    if (!decision.billable) continue;
    perConversation[decision.category] += 1;
  }
  const scaled = emptyVolume();
  for (const category of Object.keys(perConversation) as Category[]) {
    scaled[category] = perConversation[category] * Math.max(0, Math.floor(conversationsPerMonth));
  }
  return scaled;
}
