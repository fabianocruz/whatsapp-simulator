import type { Category, Currency, LocalizedText, RateCard, RuleSet, TemplateCategory } from '@dyvit/whatsapp-pricing-data';
import type { MessageContent } from './content';

export type { Category, Currency, LocalizedText, RateCard, RuleSet, TemplateCategory };

export type Direction = 'business_to_user' | 'user_to_business';
export type MessageKind = 'template' | 'non_template';
export type MsgStatus = 'sent' | 'delivered' | 'read' | 'failed';
export type EntryPoint = 'click_to_whatsapp_ad' | 'facebook_page_cta' | 'organic';

/**
 * Content types the phone frame can render. Pricing never depends on this — Meta bills
 * by category, not by media type — but the emulator and the tips engine do.
 */
export type ContentType =
  | 'text'
  | 'image'
  | 'audio'
  | 'video'
  | 'document'
  | 'sticker'
  | 'location'
  | 'interactive_buttons'
  | 'interactive_list'
  | 'cta_url'
  | 'flow';

export interface SimMessage {
  id: string;
  direction: Direction;
  kind: MessageKind;
  /** Templates carry marketing|utility|authentication; non-templates are always service. */
  category: Category;
  /** ISO timestamp. The conversation clock lives here — it is what opens and closes windows. */
  sentAt: string;
  status: MsgStatus;
  /** Only meaningful on user_to_business messages: how the customer reached the business. */
  entryPoint?: EntryPoint;
  contentType?: ContentType;
  templateName?: string;
  bodyPreview?: string;
  /**
   * Structured content, when the message came through the Cloud API or a scenario that
   * declares it. The phone frame renders this; pricing ignores it entirely. When absent,
   * `bodyPreview` is rendered as a plain bubble.
   */
  content?: MessageContent;
}

/** Window state at the instant a message was sent — the "why" behind most decisions. */
export interface WindowState {
  /** A customer message landed less than `cswHours` ago. */
  cswOpen: boolean;
  /** ISO instant the CSW closes, or null when no customer message has arrived. */
  cswOpenUntil: string | null;
  /** Inside a 72h free entry point window opened by a CTWA ad or Page CTA. */
  fepActive: boolean;
  fepActiveUntil: string | null;
  /** Which entry point opened the active FEP, when one is active. */
  fepEntryPoint: EntryPoint | null;
}

export type ReasonCode =
  | 'FREE_INBOUND'
  | 'NOT_BILLABLE_NOT_DELIVERED'
  | 'NOT_BILLABLE_FAILED'
  | 'FREE_IN_FEP'
  | 'BILLABLE_MARKETING_TEMPLATE'
  | 'FREE_IN_CSW'
  | 'BILLABLE_UTILITY_TEMPLATE'
  | 'BILLABLE_AUTHENTICATION_TEMPLATE'
  | 'FREE_SERVICE'
  | 'FREE_SERVICE_ALLOWANCE'
  | 'BILLABLE_SERVICE'
  | 'INVALID_NON_TEMPLATE_OUTSIDE_CSW';

/**
 * The full trace for one message. Everything the UI needs to answer "why this number?"
 * without re-running the engine: which ruleset, which rule, which window, which rate.
 */
export interface PriceDecision {
  messageId: string;
  rulesetVersion: string;
  /** Stable id of the rule that decided this message, e.g. 'R3_MARKETING_TEMPLATE'. */
  ruleId: string;
  category: Category;
  market: string;
  currency: Currency;
  windowState: WindowState;
  billable: boolean;
  /** Per-message rate applied, or null when nothing was charged. */
  unitRate: number | null;
  /** Index into the rate card's tier table, when a volume tier changed the rate. */
  tierApplied: number | null;
  /** Charge in `currency`, as a decimal number. */
  amount: number;
  /** Same charge in integer micros — the value the engine actually sums. */
  amountMicros: number;
  reasonCode: ReasonCode;
  explanation: LocalizedText;
  /** Primary source for the rule that fired. */
  sourceUrl: string;
  /** effectiveFrom of the ruleset that decided this message. */
  effectiveAt: string;
}

/**
 * Monthly counters the conversation-level engine can optionally consult.
 *
 * Left out by default, and that default is deliberate: a shared conversation link must
 * price identically for everyone who opens it, so the per-conversation taximeter shows
 * list rates. Tiers and the service allowance are a function of the whole month, and
 * they live in the monthly projection layer (`projectMonthly`). Pass this only when you
 * want a conversation priced as the Nth conversation of a month.
 */
export interface MonthlyContext {
  /** Billable service messages already sent this month on this phone number. */
  serviceMessagesUsedThisMonth?: number;
  /** Billable messages already sent this month, per tiered category, for tier lookup. */
  billableVolumeThisMonth?: Partial<Record<'utility' | 'authentication', number>>;
}

export interface PriceConversationOptions {
  /** ISO date selecting the ruleset and rate card in force ("rules as of"). */
  asOf: string | Date;
  /** ISO 3166-1 alpha-2 market of the recipient. Defaults to 'BR'. */
  market?: string;
  currency?: Currency;
  monthlyContext?: MonthlyContext;
}

export interface ValidationIssue {
  code: 'NON_TEMPLATE_OUTSIDE_CSW' | 'OUT_OF_ORDER_TIMESTAMP' | 'INVALID_CATEGORY_FOR_KIND' | 'DUPLICATE_MESSAGE_ID' | 'INVALID_TIMESTAMP';
  messageId: string;
  message: LocalizedText;
}

export interface CategoryBreakdown {
  category: Category;
  messages: number;
  billableMessages: number;
  amountMicros: number;
  amount: number;
}

export interface PricedConversation {
  ruleSet: RuleSet;
  rateCard: RateCard;
  market: string;
  currency: Currency;
  asOf: string;
  decisions: PriceDecision[];
  /** Decisions keyed by message id, for O(1) lookup from the UI. */
  byMessageId: Record<string, PriceDecision>;
  totalMicros: number;
  total: number;
  billableCount: number;
  breakdown: CategoryBreakdown[];
  issues: ValidationIssue[];
  warnings: import('@dyvit/whatsapp-pricing-data').DataWarning[];
}
