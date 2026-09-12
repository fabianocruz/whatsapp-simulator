'use client';

import type { PriceDecision } from '@dyvit/whatsapp-pricing';
import { REASON_LABELS } from '@dyvit/whatsapp-pricing';
import type { Locale } from '../i18n/dictionary';
import { money } from '../lib/format';
import { InfoIcon } from './icons';

interface Props {
  decision: PriceDecision;
  locale: Locale;
  onOpenTrace: (decision: PriceDecision) => void;
  traceLabel: string;
}

/**
 * The taximeter reading attached to one bubble. Always a button: the whole product rests
 * on being able to ask "why this number?" and get the rule back.
 */
export function PriceChip({ decision, locale, onOpenTrace, traceLabel }: Props) {
  const invalid = decision.reasonCode === 'INVALID_NON_TEMPLATE_OUTSIDE_CSW';
  const label = REASON_LABELS[decision.reasonCode][locale];
  // Free decisions carry their own "gratis ·" prefix in the label, so prepending the
  // free word again reads as "gratis · gratis · recebida".
  const amount = decision.billable ? money(decision.amount, decision.currency, locale) : null;

  // The chip sits on the phone's dark wallpaper, not on the page's paper background, so it
  // carries its own palette rather than the Dyvit light tokens.
  const tone = invalid
    ? 'border-[rgba(241,92,109,0.45)] bg-[rgba(241,92,109,0.16)] text-[#F5909C]'
    : decision.billable
      ? 'border-white/15 bg-white/10 text-white/80'
      : 'border-[rgba(143,227,192,0.35)] bg-[rgba(10,110,74,0.3)] text-[#8FE3C0]';

  return (
    <button
      type="button"
      onClick={() => onOpenTrace(decision)}
      aria-label={`${traceLabel}: ${amount ? `${amount} · ` : ''}${label}`}
      className={`mono mt-1 inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] leading-4 transition hover:brightness-125 ${tone}`}
    >
      {amount && (
        <>
          <span>{amount}</span>
          <span aria-hidden="true">·</span>
        </>
      )}
      <span>{label}</span>
      <InfoIcon />
    </button>
  );
}
