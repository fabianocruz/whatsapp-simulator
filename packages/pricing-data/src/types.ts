/**
 * Data contracts for the open rate-card / ruleset dataset.
 *
 * Everything the pricing engine needs to price a message lives here as DATA, never as
 * code. A rule that changes on a calendar date becomes a new RuleSet file; a price that
 * changes becomes a new RateCard file. The engine only ever asks "which file is in force
 * at this date?" — it never branches on a date literal.
 */

export type TemplateCategory = 'marketing' | 'utility' | 'authentication';
export type Category = TemplateCategory | 'service';
export type Currency = 'BRL' | 'USD';

/** Categories that can carry a volume-tier discount. */
export type TieredCategory = 'utility' | 'authentication';

export interface LocalizedText {
  pt: string;
  en: string;
}

export interface VolumeTier {
  /** Inclusive lower bound, in billable messages for the month. */
  from: number;
  /** Exclusive upper bound; `null` means "and everything above". */
  to: number | null;
  /** Informational: discount off the list rate, as published by Meta. */
  discountPct: number;
  /** Effective per-message rate inside this tier. */
  rate: number;
}

export interface VolumeTierTable {
  category: TieredCategory;
  /**
   * `false` while the message-count thresholds are placeholders without a primary
   * source. Consumers must surface this; `assertReleaseReady()` refuses to ship on it.
   */
  tiersVerified: boolean;
  tiers: VolumeTier[];
}

export interface RateCard {
  /** ISO 3166-1 alpha-2 market code. */
  market: string;
  marketName: LocalizedText;
  callingCode: string;
  currency: Currency;
  /** ISO date (YYYY-MM-DD) this card takes effect. */
  effectiveFrom: string;
  /** ISO date this card stops applying, inclusive; `null` means "still current". */
  effectiveTo: string | null;
  rates: Record<TemplateCategory, number>;
  /** `false` while the list rates have not been checked against Meta's own rate card. */
  ratesVerified: boolean;
  volumeTiers: VolumeTierTable[];
  sourceUrl: string;
  /**
   * ISO date this file was last checked against the primary source. Meta only changes
   * prices on 01/01, 01/04, 01/07 and 01/10, so a card that has not been re-checked in
   * over a quarter is worth a second look — and the README badge quotes this.
   */
  verifiedAt: string;
  notes: LocalizedText;
}

export interface RuleSet {
  id: string;
  effectiveFrom: string;
  effectiveTo: string | null;
  model: 'PMP';
  /** From 2026-10-01: non-template replies are billed. */
  serviceMessagesBillable: boolean;
  /** Until 2026-09-30: utility templates inside an open CSW are free. */
  utilityFreeInCSW: boolean;
  /** Free service messages per calendar month per phone number. 0 when not in force. */
  serviceFreeAllowancePerMonth: number;
  /** Whether billable service messages take utility/authentication volume tiers. */
  serviceUsesVolumeTiers: boolean;
  /** Customer service window length. */
  cswHours: number;
  /** Free entry point window length. */
  fepHours: number;
  /** How fast the business must answer an ad/CTA entry for the FEP to open. */
  fepResponseWindowHours: number;
  notes: LocalizedText;
  sourceUrl: string;
  verified: boolean;
  /** ISO date this ruleset was last checked against the primary source. */
  verifiedAt: string;
  /** Free-form map of fields whose value is an assumption, keyed by field name. */
  unverified?: Record<string, string>;
}
