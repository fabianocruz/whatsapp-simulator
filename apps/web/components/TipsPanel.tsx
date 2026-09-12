'use client';

import type { Tip } from '@dyvit/whatsapp-tips';
import { autoFractionDigits } from '@dyvit/whatsapp-pricing';
import type { Currency } from '@dyvit/whatsapp-pricing';
import type { Dictionary, Locale } from '../i18n/dictionary';
import { money } from '../lib/format';

interface Props {
  tips: readonly Tip[];
  locale: Locale;
  dict: Dictionary;
  currency: Currency;
  onHighlight: (messageIds: readonly string[]) => void;
}

const TONE: Record<Tip['severity'], string> = {
  risk: 'border-[color:var(--color-alert)] bg-[color:var(--color-alert-bg)]',
  saving: 'border-[color:var(--color-em-border)] bg-[color:var(--color-em-bg)]',
  info: 'border-[color:var(--color-ink-15)] bg-[color:var(--color-ink-04)]',
};

export function TipsPanel({ tips, locale, dict, currency, onHighlight }: Props) {
  return (
    <section
      className="rounded-[var(--radius-r-lg)] border border-[color:var(--color-ink-15)] bg-white p-4"
      aria-labelledby="tips-heading"
    >
      <h3 id="tips-heading" className="section-label mb-3">
        {dict.tips}
      </h3>
      {tips.length === 0 ? (
        <p className="text-[12px] text-[color:var(--color-ink-40)]">{dict.noTips}</p>
      ) : (
        <ul className="space-y-2">
          {tips.map((tip) => (
            <li
              key={tip.ruleId}
              className={`rounded-[var(--radius-r)] border p-3 ${TONE[tip.severity]}`}
              onMouseEnter={() => onHighlight(tip.triggeredBy)}
              onMouseLeave={() => onHighlight([])}
              onFocus={() => onHighlight(tip.triggeredBy)}
              onBlur={() => onHighlight([])}
            >
              <div className="flex items-baseline justify-between gap-2">
                <h4 className="text-[13px] font-semibold tracking-[-0.02em] text-[color:var(--color-ink)]">
                  {locale === 'pt' ? tip.titlePt : tip.titleEn}
                </h4>
                <span className="mono shrink-0 text-[10px] text-[color:var(--color-ink-40)]">{tip.ruleId}</span>
              </div>
              <p className="mt-1 text-[12px] leading-relaxed text-[color:var(--color-ink-70)]">
                {locale === 'pt' ? tip.textPt : tip.textEn}
              </p>
              {tip.estimatedSavingMicros > 0 && (
                <p className="mono mt-1.5 text-[11px] text-[color:var(--color-em)]">
                  {money(tip.estimatedSaving, currency, locale, autoFractionDigits(tip.estimatedSaving))} · {dict.estimatedSaving}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
