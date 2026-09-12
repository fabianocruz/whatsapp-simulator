import { formatMoney } from './money.js';
import type { Currency, LocalizedText, ReasonCode } from './types.js';

export interface ExplanationContext {
  currency: Currency;
  /** Rate that was applied, when one was. */
  rate?: number | null;
  /** ISO instant the CSW closes, for the window-based codes. */
  cswOpenUntil?: string | null;
  fepActiveUntil?: string | null;
  /** Discount percentage of the tier that fired. */
  discountPct?: number | null;
  /** Free service messages still available this month, after this one. */
  allowanceRemaining?: number | null;
  /** Total monthly service allowance, for the allowance codes. */
  allowanceTotal?: number | null;
  /**
   * Whether the monthly allowance was actually consulted for this message. False when the
   * caller passed no `monthlyContext`, which is the default: the conversation-level
   * taximeter shows list rates and the allowance lives in the monthly projection. Without
   * this flag a list-rate charge would claim the allowance had run out.
   */
  allowanceEvaluated?: boolean;
}

/** Renders an ISO instant as a short local-ish time, e.g. "13:42 de 12/09". */
function shortTime(iso: string | null | undefined, locale: 'pt-BR' | 'en-US'): string {
  if (!iso) return 'n/a';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'n/a';
  return new Intl.DateTimeFormat(locale, {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

function money(ctx: ExplanationContext, locale: 'pt-BR' | 'en-US'): string {
  if (ctx.rate === null || ctx.rate === undefined) return 'n/a';
  return formatMoney(ctx.rate, ctx.currency, locale);
}

type Builder = (ctx: ExplanationContext) => LocalizedText;

/**
 * One human sentence per reason code, in both languages. Every PriceDecision carries the
 * rendered text so the UI never has to reimplement the rule to describe it.
 */
const BUILDERS: Record<ReasonCode, Builder> = {
  FREE_INBOUND: () => ({
    pt: 'Mensagem do usuario nunca e cobrada, e abre ou renova a janela de atendimento de 24h.',
    en: 'User messages are never billed, and they open or renew the 24h customer service window.',
  }),
  NOT_BILLABLE_NOT_DELIVERED: () => ({
    pt: 'Sem cobranca: a cobranca so acontece quando a mensagem e entregue.',
    en: 'Not billed: charging only happens once the message is delivered.',
  }),
  NOT_BILLABLE_FAILED: () => ({
    pt: 'Sem cobranca: mensagem com falha de entrega nao gera cobranca (mas derruba o quality rating).',
    en: 'Not billed: a failed message is not charged (but it does hurt your quality rating).',
  }),
  FREE_IN_FEP: (ctx) => ({
    pt: `Gratis: dentro da janela de free entry point de 72h, aberta por anuncio Click-to-WhatsApp ou CTA de Pagina. Vale ate ${shortTime(ctx.fepActiveUntil, 'pt-BR')} (UTC).`,
    en: `Free: inside the 72h free entry point window opened by a Click-to-WhatsApp ad or Page CTA. Valid until ${shortTime(ctx.fepActiveUntil, 'en-US')} (UTC).`,
  }),
  BILLABLE_MARKETING_TEMPLATE: (ctx) => ({
    pt: `Cobrado: template de marketing e cobrado em toda entrega, dentro ou fora da janela. Rate ${money(ctx, 'pt-BR')}.`,
    en: `Billed: a marketing template is charged on every delivery, in or out of the window. Rate ${money(ctx, 'en-US')}.`,
  }),
  FREE_IN_CSW: (ctx) => ({
    pt: `Gratis: template utility dentro da janela de atendimento de 24h, aberta ate ${shortTime(ctx.cswOpenUntil, 'pt-BR')} (UTC). Essa gratuidade acaba em 30/09/2026.`,
    en: `Free: utility template inside the 24h customer service window, open until ${shortTime(ctx.cswOpenUntil, 'en-US')} (UTC). This exemption ends on 2026-09-30.`,
  }),
  BILLABLE_UTILITY_TEMPLATE: (ctx) => ({
    pt: `Cobrado: template utility ${ctx.cswOpenUntil ? 'fora da janela de atendimento' : 'sem janela de atendimento aberta'}. Rate ${money(ctx, 'pt-BR')}${ctx.discountPct ? ` (tier -${ctx.discountPct}%)` : ''}.`,
    en: `Billed: utility template ${ctx.cswOpenUntil ? 'outside the customer service window' : 'with no customer service window open'}. Rate ${money(ctx, 'en-US')}${ctx.discountPct ? ` (tier -${ctx.discountPct}%)` : ''}.`,
  }),
  BILLABLE_AUTHENTICATION_TEMPLATE: (ctx) => ({
    pt: `Cobrado: template de authentication e sempre cobrado na entrega. Rate ${money(ctx, 'pt-BR')}${ctx.discountPct ? ` (tier -${ctx.discountPct}%)` : ''}.`,
    en: `Billed: an authentication template is always charged on delivery. Rate ${money(ctx, 'en-US')}${ctx.discountPct ? ` (tier -${ctx.discountPct}%)` : ''}.`,
  }),
  FREE_SERVICE: () => ({
    pt: 'Gratis: resposta non-template dentro da janela de atendimento. A partir de 01/10/2026 mensagens de service passam a ser cobradas.',
    en: 'Free: non-template reply inside the customer service window. From 2026-10-01 service messages become billable.',
  }),
  FREE_SERVICE_ALLOWANCE: (ctx) => ({
    pt: `Gratis pela franquia: ${ctx.allowanceTotal ?? 1000} mensagens de service por mes por numero. Restam ${ctx.allowanceRemaining ?? 0} neste mes.`,
    en: `Free via the allowance: ${ctx.allowanceTotal ?? 1000} service messages per month per phone number. ${ctx.allowanceRemaining ?? 0} left this month.`,
  }),
  BILLABLE_SERVICE: (ctx) =>
    ctx.allowanceEvaluated
      ? {
          pt: `Cobrado: mensagem de service ao rate de utility/authentication do mercado, ${money(ctx, 'pt-BR')}. A franquia de ${ctx.allowanceTotal ?? 1000} mensagens/mes deste numero ja foi consumida.`,
          en: `Billed: service message at the market utility/authentication rate, ${money(ctx, 'en-US')}. This number's allowance of ${ctx.allowanceTotal ?? 1000} messages/month is already used up.`,
        }
      : {
          pt: `Cobrado: mensagem de service ao rate de utility/authentication do mercado, ${money(ctx, 'pt-BR')}. Este e o rate de lista: a franquia de ${ctx.allowanceTotal ?? 1000} mensagens/mes por numero e aplicada na projecao mensal, nao no custo por conversa.`,
          en: `Billed: service message at the market utility/authentication rate, ${money(ctx, 'en-US')}. This is the list rate: the allowance of ${ctx.allowanceTotal ?? 1000} messages/month per number is applied in the monthly projection, not in the per-conversation cost.`,
        },
  INVALID_NON_TEMPLATE_OUTSIDE_CSW: () => ({
    pt: 'Cenario invalido: fora da janela de 24h so e possivel enviar template. A Meta rejeitaria este envio, entao nada foi cobrado.',
    en: 'Invalid scenario: outside the 24h window only templates can be sent. Meta would reject this send, so nothing was charged.',
  }),
};

export function explain(code: ReasonCode, ctx: ExplanationContext): LocalizedText {
  return BUILDERS[code](ctx);
}

/** Short label for chips and tables. */
export const REASON_LABELS: Record<ReasonCode, LocalizedText> = {
  FREE_INBOUND: { pt: 'gratis · recebida', en: 'free · inbound' },
  NOT_BILLABLE_NOT_DELIVERED: { pt: 'nao entregue', en: 'not delivered' },
  NOT_BILLABLE_FAILED: { pt: 'falhou · nao cobra', en: 'failed · not billed' },
  FREE_IN_FEP: { pt: 'gratis · FEP 72h', en: 'free · 72h FEP' },
  BILLABLE_MARKETING_TEMPLATE: { pt: 'marketing', en: 'marketing' },
  FREE_IN_CSW: { pt: 'gratis · dentro da CSW', en: 'free · inside CSW' },
  BILLABLE_UTILITY_TEMPLATE: { pt: 'utility', en: 'utility' },
  BILLABLE_AUTHENTICATION_TEMPLATE: { pt: 'authentication', en: 'authentication' },
  FREE_SERVICE: { pt: 'gratis · service', en: 'free · service' },
  FREE_SERVICE_ALLOWANCE: { pt: 'gratis · franquia', en: 'free · allowance' },
  BILLABLE_SERVICE: { pt: 'service', en: 'service' },
  INVALID_NON_TEMPLATE_OUTSIDE_CSW: { pt: 'cenario invalido', en: 'invalid scenario' },
};
