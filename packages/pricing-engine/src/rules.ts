import type { RateCard, RuleSet, TieredCategory } from '@dyvit/whatsapp-pricing-data';
import { fromMicros, toMicros } from './money.js';
import { explain } from './reason-codes.js';
import { findTier } from './tiers.js';
import type { Currency, PriceDecision, ReasonCode, SimMessage, WindowState } from './types.js';

/**
 * Statuses that trigger a charge.
 *
 * The spec words this as "billing only happens on delivered". `read` is included because
 * a message cannot be read without having been delivered, and SimMessage carries a single
 * terminal status rather than a status history — treating `read` as unbilled would make
 * every read message free, which is not how Meta bills.
 */
export const BILLABLE_STATUSES = new Set<SimMessage['status']>(['delivered', 'read']);

/** Mutable per-month counters threaded through a timeline as it is priced. */
export interface RuleCursors {
  /**
   * Billable messages already counted this month, per tiered category. `null` disables
   * tier lookup entirely and prices everything at the list rate.
   */
  tierVolume: Record<TieredCategory, number> | null;
  /**
   * Billable service messages already sent this month on this number. `null` disables the
   * allowance, which is the default for conversation-level pricing.
   */
  serviceUsed: number | null;
}

export interface RuleContext {
  ruleSet: RuleSet;
  rateCard: RateCard;
  currency: Currency;
  cursors: RuleCursors;
}

interface Charge {
  rate: number;
  tierApplied: number | null;
  discountPct: number | null;
}

/**
 * Resolves the per-message rate for a tiered category, consuming one unit of monthly
 * volume so the next message in the same timeline can land in the next tier.
 */
function chargeTiered(ctx: RuleContext, category: TieredCategory): Charge {
  const listRate = ctx.rateCard.rates[category];
  if (ctx.cursors.tierVolume === null) {
    return { rate: listRate, tierApplied: null, discountPct: null };
  }
  const position = ctx.cursors.tierVolume[category];
  const lookup = findTier(ctx.rateCard, category, position);
  ctx.cursors.tierVolume[category] = position + 1;
  if (!lookup) return { rate: listRate, tierApplied: null, discountPct: null };
  return { rate: lookup.tier.rate, tierApplied: lookup.index, discountPct: lookup.tier.discountPct };
}

interface Outcome {
  ruleId: string;
  reasonCode: ReasonCode;
  charge: Charge | null;
  allowanceRemaining?: number;
  /** Set when the monthly service allowance was actually consulted for this message. */
  allowanceEvaluated?: boolean;
}

/**
 * The pricing contract, as a single ordered decision. Each branch is one numbered rule
 * from the spec; the order is the precedence, and it matters: a failed message is not
 * charged even inside a billable window, and the FEP beats every category rule.
 */
function decide(message: SimMessage, window: WindowState, ctx: RuleContext): Outcome {
  // R1 — user_to_business is never billed; it is what opens and renews the CSW.
  if (message.direction === 'user_to_business') {
    return { ruleId: 'R1_INBOUND', reasonCode: 'FREE_INBOUND', charge: null };
  }

  // R2 — charging is tied to delivery.
  if (!BILLABLE_STATUSES.has(message.status)) {
    return {
      ruleId: 'R2_DELIVERY_REQUIRED',
      reasonCode: message.status === 'failed' ? 'NOT_BILLABLE_FAILED' : 'NOT_BILLABLE_NOT_DELIVERED',
      charge: null,
    };
  }

  // R7 — the free entry point window makes everything free while it lasts, templates
  // included, and it is independent of the CSW.
  if (window.fepActive) {
    return { ruleId: 'R7_FREE_ENTRY_POINT', reasonCode: 'FREE_IN_FEP', charge: null };
  }

  if (message.kind === 'non_template') {
    // R6 — non-templates can only exist inside an open CSW. Outside it Meta rejects the
    // send, so the honest simulation is "this would not have gone out", not "free".
    if (!window.cswOpen) {
      return {
        ruleId: 'R6_SERVICE',
        reasonCode: 'INVALID_NON_TEMPLATE_OUTSIDE_CSW',
        charge: null,
      };
    }
    if (!ctx.ruleSet.serviceMessagesBillable) {
      return { ruleId: 'R6_SERVICE', reasonCode: 'FREE_SERVICE', charge: null };
    }
    if (ctx.cursors.serviceUsed !== null && ctx.cursors.serviceUsed < ctx.ruleSet.serviceFreeAllowancePerMonth) {
      ctx.cursors.serviceUsed += 1;
      return {
        ruleId: 'R6_SERVICE',
        reasonCode: 'FREE_SERVICE_ALLOWANCE',
        charge: null,
        allowanceRemaining: ctx.ruleSet.serviceFreeAllowancePerMonth - ctx.cursors.serviceUsed,
      };
    }
    // Reaching here with a cursor means the allowance really did run out; reaching here
    // without one means it was never in scope. The explanation has to say which.
    const allowanceEvaluated = ctx.cursors.serviceUsed !== null;
    if (ctx.cursors.serviceUsed !== null) ctx.cursors.serviceUsed += 1;
    // Service is billed at the market's utility/authentication rate. Whether volume tiers
    // apply to it is not confirmed by Meta, so the ruleset carries the assumption.
    const charge = ctx.ruleSet.serviceUsesVolumeTiers
      ? chargeTiered(ctx, 'utility')
      : { rate: ctx.rateCard.rates.utility, tierApplied: null, discountPct: null };
    return { ruleId: 'R6_SERVICE', reasonCode: 'BILLABLE_SERVICE', charge, allowanceEvaluated };
  }

  switch (message.category) {
    // R3 — marketing is charged on every delivery, window or no window.
    case 'marketing':
      return {
        ruleId: 'R3_MARKETING_TEMPLATE',
        reasonCode: 'BILLABLE_MARKETING_TEMPLATE',
        charge: { rate: ctx.rateCard.rates.marketing, tierApplied: null, discountPct: null },
      };

    // R4 — utility is free inside the CSW only while the ruleset says so.
    case 'utility':
      if (window.cswOpen && ctx.ruleSet.utilityFreeInCSW) {
        return { ruleId: 'R4_UTILITY_TEMPLATE', reasonCode: 'FREE_IN_CSW', charge: null };
      }
      return {
        ruleId: 'R4_UTILITY_TEMPLATE',
        reasonCode: 'BILLABLE_UTILITY_TEMPLATE',
        charge: chargeTiered(ctx, 'utility'),
      };

    // R5 — authentication is always billed.
    case 'authentication':
      return {
        ruleId: 'R5_AUTHENTICATION_TEMPLATE',
        reasonCode: 'BILLABLE_AUTHENTICATION_TEMPLATE',
        charge: chargeTiered(ctx, 'authentication'),
      };

    // A template tagged `service` is a malformed scenario; validation reports it and we
    // price it the way Meta would treat the send it most resembles: a service reply.
    default:
      return { ruleId: 'R6_SERVICE', reasonCode: 'FREE_SERVICE', charge: null };
  }
}

/** Builds the full, UI-ready decision for one message. */
export function priceMessage(
  message: SimMessage,
  window: WindowState,
  ctx: RuleContext,
  market: string,
): PriceDecision {
  const outcome = decide(message, window, ctx);
  const amountMicros = outcome.charge ? toMicros(outcome.charge.rate) : 0;
  return {
    messageId: message.id,
    rulesetVersion: ctx.ruleSet.id,
    ruleId: outcome.ruleId,
    category: message.kind === 'non_template' ? 'service' : message.category,
    market,
    currency: ctx.currency,
    windowState: window,
    billable: outcome.charge !== null,
    unitRate: outcome.charge?.rate ?? null,
    tierApplied: outcome.charge?.tierApplied ?? null,
    amount: fromMicros(amountMicros),
    amountMicros,
    reasonCode: outcome.reasonCode,
    explanation: explain(outcome.reasonCode, {
      currency: ctx.currency,
      rate: outcome.charge?.rate ?? null,
      cswOpenUntil: window.cswOpenUntil,
      fepActiveUntil: window.fepActiveUntil,
      discountPct: outcome.charge?.discountPct ?? null,
      allowanceRemaining: outcome.allowanceRemaining ?? null,
      allowanceTotal: ctx.ruleSet.serviceFreeAllowancePerMonth || null,
      allowanceEvaluated: outcome.allowanceEvaluated ?? false,
    }),
    sourceUrl: ctx.ruleSet.sourceUrl,
    effectiveAt: ctx.ruleSet.effectiveFrom,
  };
}
