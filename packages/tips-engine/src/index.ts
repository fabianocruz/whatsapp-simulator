import { priceConversation, sortByTime } from '@dyvit/whatsapp-pricing';
import type { PriceConversationOptions, SimMessage } from '@dyvit/whatsapp-pricing';
import { TIP_RULES } from './rules/catalogue.js';
import type { Tip, TipRuleContext, TipsInput } from './types.js';

export * from './types.js';
export { TIP_RULES } from './rules/catalogue.js';

/** The ruleset every "after October" tip compares against. */
export const FUTURE_RULESET_AS_OF = '2026-10-01';

/**
 * Runs every catalogue rule over a priced conversation.
 *
 * Rules are pure and independent: one throwing or returning null never stops the others.
 * Results come back sorted by estimated saving so the most valuable advice is on top,
 * with warnings ahead of purely informational cards at the same value.
 */
export function generateTips(input: TipsInput): Tip[] {
  const ctx: TipRuleContext = {
    ...input,
    ruleSet: input.priced.ruleSet,
    rateCard: input.priced.rateCard,
    currency: input.priced.currency,
    sorted: sortByTime(input.messages),
  };

  const severityRank: Record<Tip['severity'], number> = { risk: 0, saving: 1, info: 2 };

  return TIP_RULES.map((rule) => rule(ctx))
    .filter((tip): tip is Tip => tip !== null)
    .sort((a, b) => {
      if (b.estimatedSavingMicros !== a.estimatedSavingMicros) {
        return b.estimatedSavingMicros - a.estimatedSavingMicros;
      }
      return severityRank[a.severity] - severityRank[b.severity];
    });
}

export interface AnalyzeOptions extends PriceConversationOptions {
  conversationsPerMonth?: number;
  phoneNumbers?: number;
}

/**
 * Convenience wrapper: prices the conversation under the selected ruleset and under the
 * October one, then runs the tips. This is what the web app and the CLI both call.
 */
export function analyzeConversation(messages: readonly SimMessage[], options: AnalyzeOptions) {
  const { conversationsPerMonth, phoneNumbers, ...priceOptions } = options;
  const priced = priceConversation(messages, priceOptions);
  const future =
    priced.ruleSet.id === 'ruleset-2026-10-01'
      ? priced
      : priceConversation(messages, { ...priceOptions, asOf: FUTURE_RULESET_AS_OF });

  const tips = generateTips({
    priced,
    future,
    messages,
    ...(conversationsPerMonth === undefined ? {} : { conversationsPerMonth }),
    ...(phoneNumbers === undefined ? {} : { phoneNumbers }),
  });

  return { priced, future, tips };
}
