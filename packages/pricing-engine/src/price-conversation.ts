import {
  collectDataWarnings,
  selectRateCard,
  selectRuleSet,
  toEffectiveDate,
} from '@dyvit/whatsapp-pricing-data';
import type { TieredCategory } from '@dyvit/whatsapp-pricing-data';
import { fromMicros } from './money';
import { priceMessage, type RuleContext, type RuleCursors } from './rules';
import type {
  Category,
  CategoryBreakdown,
  PriceConversationOptions,
  PriceDecision,
  PricedConversation,
  SimMessage,
} from './types';
import { validateTimeline } from './validate';
import { deriveWindows } from './windows';

const ALL_CATEGORIES: readonly Category[] = ['marketing', 'utility', 'authentication', 'service'];

function buildCursors(options: PriceConversationOptions): RuleCursors {
  const monthly = options.monthlyContext;
  const volume = monthly?.billableVolumeThisMonth;
  const tierVolume: Record<TieredCategory, number> | null = volume
    ? { utility: volume.utility ?? 0, authentication: volume.authentication ?? 0 }
    : null;
  const serviceUsed =
    monthly?.serviceMessagesUsedThisMonth === undefined ? null : monthly.serviceMessagesUsedThisMonth;
  return { tierVolume, serviceUsed };
}

function buildBreakdown(decisions: readonly PriceDecision[]): CategoryBreakdown[] {
  return ALL_CATEGORIES.map((category) => {
    const rows = decisions.filter((d) => d.category === category);
    const amountMicros = rows.reduce((sum, d) => sum + d.amountMicros, 0);
    return {
      category,
      messages: rows.length,
      billableMessages: rows.filter((d) => d.billable).length,
      amountMicros,
      amount: fromMicros(amountMicros),
    };
  }).filter((row) => row.messages > 0);
}

/**
 * Prices a whole conversation under the ruleset in force on `asOf`.
 *
 * The "rules as of" date is independent of the message timestamps on purpose: that is
 * what lets the UI run the exact same timeline through today's ruleset and through
 * 2026-10-01 and show the delta. Message timestamps only drive windows.
 *
 * Volume tiers and the monthly service allowance stay off unless `monthlyContext` says
 * otherwise — see `MonthlyContext` for why, and `projectMonthly` for the layer that owns
 * monthly counters.
 */
export function priceConversation(
  messages: readonly SimMessage[],
  options: PriceConversationOptions,
): PricedConversation {
  const market = (options.market ?? 'BR').toUpperCase();
  const currency = options.currency ?? 'BRL';
  const asOf = toEffectiveDate(options.asOf);

  const ruleSet = selectRuleSet(asOf);
  const rateCard = selectRateCard(market, currency, asOf);
  const issues = validateTimeline(messages);
  const { sorted, states } = deriveWindows(messages, ruleSet);

  const ctx: RuleContext = { ruleSet, rateCard, currency, cursors: buildCursors(options) };

  const decisions = sorted.map((message, index) => priceMessage(message, states[index]!, ctx, market));

  const byMessageId: Record<string, PriceDecision> = {};
  for (const decision of decisions) byMessageId[decision.messageId] = decision;

  const totalMicros = decisions.reduce((sum, d) => sum + d.amountMicros, 0);

  return {
    ruleSet,
    rateCard,
    market,
    currency,
    asOf,
    decisions,
    byMessageId,
    totalMicros,
    total: fromMicros(totalMicros),
    billableCount: decisions.filter((d) => d.billable).length,
    breakdown: buildBreakdown(decisions),
    issues,
    warnings: collectDataWarnings(rateCard, ruleSet),
  };
}

export interface RulesetComparison {
  current: PricedConversation;
  future: PricedConversation;
  deltaMicros: number;
  delta: number;
  /** Ratio of future to current cost; null when the current cost is zero. */
  multiplier: number | null;
}

/**
 * Runs one timeline through two rulesets and returns the delta.
 *
 * This is the teaching moment of the product: the same conversation, before and after
 * service messages and in-window utility templates start being billed.
 */
export function compareRulesets(
  messages: readonly SimMessage[],
  options: PriceConversationOptions,
  futureAsOf: string | Date = '2026-10-01',
): RulesetComparison {
  const current = priceConversation(messages, options);
  const future = priceConversation(messages, { ...options, asOf: futureAsOf });
  const deltaMicros = future.totalMicros - current.totalMicros;
  return {
    current,
    future,
    deltaMicros,
    delta: fromMicros(deltaMicros),
    multiplier: current.totalMicros === 0 ? null : future.totalMicros / current.totalMicros,
  };
}
