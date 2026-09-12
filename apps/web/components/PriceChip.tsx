'use client';

import type { PriceDecision } from '@dyvit/whatsapp-pricing';
import { REASON_LABELS } from '@dyvit/whatsapp-pricing';
import type { Locale } from '../i18n/dictionary';
import { money } from '../lib/format';
import { InfoIcon } from './icons';

interface Props {
  decision: PriceDecision;
  locale: Locale;
  freeLabel: string;
  onOpenTrace: (decision: PriceDecision) => void;
  traceLabel: string;
}

/**
 * The taximeter reading attached to one bubble. Always a button: the whole product rests
 * on being able to ask "why this number?" and get the rule back.
 */
export function PriceChip({ decision, locale, freeLabel, onOpenTrace, traceLabel }: Props) {
  const invalid = decision.reasonCode === 'INVALID_NON_TEMPLATE_OUTSIDE_CSW';
  const label = REASON_LABELS[decision.reasonCode][locale];
  const amount = decision.billable ? money(decision.amount, decision.currency, locale) : freeLabel;

  const tone = invalid
    ? 'border-[color:var(--color-alert)] bg-[color:var(--color-alert-bg)] text-[color:var(--color-alert)]'
    : decision.billable
      ? 'border-[color:var(--color-ink-15)] bg-[color:var(--color-ink-04)] text-[color:var(--color-ink-70)]'
      : 'border-[color:var(--color-em-border)] bg-[color:var(--color-em-bg)] text-[color:var(--color-em)]';

  return (
    <button
      type="button"
      onClick={() => onOpenTrace(decision)}
      aria-label={`${traceLabel}: ${amount} · ${label}`}
      className={`mono mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] leading-4 transition hover:brightness-95 ${tone}`}
    >
      <span>{amount}</span>
      <span aria-hidden="true">·</span>
      <span>{label}</span>
      <InfoIcon />
    </button>
  );
}
