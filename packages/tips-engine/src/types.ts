import type { Currency, PricedConversation, RateCard, RuleSet, SimMessage } from '@dyvit/whatsapp-pricing';

export type TipSeverity = 'saving' | 'risk' | 'info';

export interface Tip {
  /** Stable id, matching the catalogue in the spec (T1..T10). */
  ruleId: string;
  severity: TipSeverity;
  /** Messages that made the rule fire, so the UI can highlight them in the phone frame. */
  triggeredBy: string[];
  titlePt: string;
  titleEn: string;
  textPt: string;
  textEn: string;
  /**
   * Money this tip could save per conversation (or per month, for the volume rules), in
   * `currency`. Zero when the tip is a warning rather than an optimization.
   */
  estimatedSaving: number;
  estimatedSavingMicros: number;
  currency: Currency;
}

export interface TipsInput {
  /** The conversation as priced under the selected "rules as of" ruleset. */
  priced: PricedConversation;
  /**
   * The same conversation priced under the 2026-10-01 ruleset. Several rules quantify
   * "what this will cost you after October", which needs both runs.
   */
  future: PricedConversation;
  messages: readonly SimMessage[];
  /** Projected conversations per month, used by the volume-sensitive rules. */
  conversationsPerMonth?: number;
  /** Phone numbers the projected volume is spread across. */
  phoneNumbers?: number;
}

export interface TipRuleContext extends TipsInput {
  ruleSet: RuleSet;
  rateCard: RateCard;
  currency: Currency;
  /** Chronological messages, matching the order of `priced.decisions`. */
  sorted: readonly SimMessage[];
}

export type TipRule = (ctx: TipRuleContext) => Tip | null;
