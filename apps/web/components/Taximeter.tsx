'use client';

import type { MonthlyProjection, PricedConversation, RulesetComparison } from '@dyvit/whatsapp-pricing';
import type { Dictionary, Locale } from '../i18n/dictionary';
import { count, money } from '../lib/format';

interface Props {
  priced: PricedConversation;
  comparison: RulesetComparison | null;
  projection: MonthlyProjection | null;
  locale: Locale;
  dict: Dictionary;
}

export function Taximeter({ priced, comparison, projection, locale, dict }: Props) {
  return (
    <div className="rounded-[var(--radius-r-lg)] border border-[color:var(--color-ink-15)] bg-white p-4">
      <h3 className="section-label mb-2">{dict.taximeter}</h3>

      <p className="text-[11px] text-[color:var(--color-ink-40)]">{dict.conversationCost}</p>
      <p className="mt-0.5 text-[34px] leading-none font-extrabold tracking-[-0.05em] text-[color:var(--color-ink)]">
        {money(priced.total, priced.currency, locale)}
      </p>
      <p className="mono mt-1 text-[11px] text-[color:var(--color-ink-40)]">
        {priced.billableCount}/{priced.decisions.length} {dict.billedMessages}
      </p>

      {comparison && comparison.deltaMicros !== 0 && (
        <p className="mono mt-3 rounded-[var(--radius-r)] border border-[color:var(--color-em-border)] bg-[color:var(--color-em-bg)] px-3 py-2 text-[11px] text-[color:var(--color-em)]">
          {money(comparison.current.total, priced.currency, locale)} →{' '}
          {money(comparison.future.total, priced.currency, locale)} ·{' '}
          <strong className="font-semibold">
            +{money(comparison.delta, priced.currency, locale)} {dict.deltaLabel}
          </strong>
        </p>
      )}

      {priced.breakdown.length > 0 && (
        <>
          <h4 className="mono mt-4 mb-1.5 text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
            {dict.breakdown}
          </h4>
          <table className="w-full text-[12px]">
            <tbody>
              {priced.breakdown.map((row) => (
                <tr key={row.category} className="border-t border-[color:var(--color-ink-07)]">
                  <td className="py-1.5 text-[color:var(--color-ink-70)]">{row.category}</td>
                  <td className="mono py-1.5 text-right text-[color:var(--color-ink-40)]">
                    {row.billableMessages}/{row.messages}
                  </td>
                  <td className="mono py-1.5 text-right font-medium">{money(row.amount, priced.currency, locale)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <h4 className="mono mt-5 mb-1.5 text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
        {dict.projection}
      </h4>
      {projection ? (
        <div className="text-[12px]">
          <p className="mono mb-2 text-[color:var(--color-ink-70)]">
            {dict.monthlyTotal}:{' '}
            <strong className="font-semibold">{money(projection.total, projection.currency, locale, 2)}</strong>
          </p>
          <ul className="space-y-1.5">
            {projection.categories.map((category) => (
              <li key={category.category} className="border-t border-[color:var(--color-ink-07)] pt-1.5">
                <div className="flex justify-between">
                  <span className="text-[color:var(--color-ink-70)]">{category.category}</span>
                  <span className="mono">{money(category.amount, projection.currency, locale, 2)}</span>
                </div>
                <div className="mono text-[10px] text-[color:var(--color-ink-40)]">
                  {count(category.messages, locale)} msg
                  {category.freeByAllowance > 0 && ` · ${count(category.freeByAllowance, locale)} ${dict.freeByAllowance}`}
                </div>
                {category.slices.length > 1 && (
                  <ul className="mono mt-0.5 space-y-0.5 text-[10px] text-[color:var(--color-ink-40)]">
                    {category.slices.map((slice, index) => (
                      <li key={`${category.category}-${index}`}>
                        {count(slice.messages, locale)} @ {money(slice.rate, projection.currency, locale)}
                        {slice.discountPct > 0 && ` (-${slice.discountPct}%)`}
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <p className="text-[12px] text-[color:var(--color-ink-40)]">{dict.projectionHint}</p>
      )}
    </div>
  );
}
