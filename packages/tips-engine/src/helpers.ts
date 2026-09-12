import { autoFractionDigits, formatMoney, fromMicros, toMicros } from '@dyvit/whatsapp-pricing';
import type { Currency, SimMessage } from '@dyvit/whatsapp-pricing';
import type { Tip, TipSeverity } from './types';

export { formatMoney, fromMicros, toMicros };

export interface TipDraft {
  ruleId: string;
  severity: TipSeverity;
  triggeredBy: string[];
  titlePt: string;
  titleEn: string;
  textPt: string;
  textEn: string;
  savingMicros?: number;
  currency: Currency;
}

export function tip(draft: TipDraft): Tip {
  const micros = Math.max(0, Math.round(draft.savingMicros ?? 0));
  return {
    ruleId: draft.ruleId,
    severity: draft.severity,
    triggeredBy: draft.triggeredBy,
    titlePt: draft.titlePt,
    titleEn: draft.titleEn,
    textPt: draft.textPt,
    textEn: draft.textEn,
    estimatedSaving: fromMicros(micros),
    estimatedSavingMicros: micros,
    currency: draft.currency,
  };
}

/**
 * Money rendered in both languages, for building tip copy.
 *
 * Decimals adapt to the size of the figure: a tip quotes per-message rates (R$ 0,0017) and
 * monthly totals (R$ 73.465,00) in the same sentence, and four decimals on the second one
 * reads as a machine that does not know what it is talking about.
 */
export function both(micros: number, currency: Currency): { pt: string; en: string } {
  const amount = fromMicros(micros);
  const digits = autoFractionDigits(amount);
  return {
    pt: formatMoney(amount, currency, 'pt-BR', digits),
    en: formatMoney(amount, currency, 'en-US', digits),
  };
}

export function isBusiness(message: SimMessage): boolean {
  return message.direction === 'business_to_user';
}

/**
 * Groups consecutive business messages into runs, skipping over nothing: a customer
 * message breaks the run. Used by the "consolidate your replies" rules.
 */
export function businessRuns(sorted: readonly SimMessage[], predicate: (m: SimMessage) => boolean): SimMessage[][] {
  const runs: SimMessage[][] = [];
  let current: SimMessage[] = [];
  for (const message of sorted) {
    if (isBusiness(message) && predicate(message)) {
      current.push(message);
      continue;
    }
    if (current.length > 0) runs.push(current);
    current = [];
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

/**
 * Words that read as transactional rather than promotional. Used only to raise a
 * question about a template's category — the real classification is Meta's.
 */
const UTILITY_HINTS = [
  'pedido',
  'entrega',
  'entregue',
  'codigo',
  'código',
  'status',
  'confirmacao',
  'confirmação',
  'confirmado',
  'agendamento',
  'agendado',
  'fatura',
  'boleto',
  'pagamento',
  'recibo',
  'comprovante',
  'protocolo',
  'rastreio',
  'order',
  'delivery',
  'receipt',
  'invoice',
  'confirmation',
  'appointment',
  'tracking',
  'payment',
];

const MARKETING_HINTS = [
  'promo',
  'desconto',
  'oferta',
  '% off',
  'novidade',
  'lancamento',
  'lançamento',
  'convite',
  'aproveite',
  'ultimo dia',
  'último dia',
  'sale',
  'discount',
  'offer',
  'launch',
];

export function looksTransactional(text: string | undefined): boolean {
  if (!text) return false;
  const haystack = text.toLowerCase();
  const utility = UTILITY_HINTS.some((hint) => haystack.includes(hint));
  const marketing = MARKETING_HINTS.some((hint) => haystack.includes(hint));
  // Only flag when the copy leans transactional and carries no promotional pitch.
  return utility && !marketing;
}

export function hoursBetween(a: string, b: string): number {
  return Math.abs(Date.parse(b) - Date.parse(a)) / 3_600_000;
}
