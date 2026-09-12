'use client';

import type { PricedConversation } from '@dyvit/whatsapp-pricing';
import type { Dictionary, Locale } from '../i18n/dictionary';

/**
 * Data warnings and scenario issues. These are never hidden: a placeholder tier threshold
 * or an impossible message has to be visible next to the number it affects.
 */
export function Notices({
  priced,
  locale,
  dict,
}: {
  priced: PricedConversation;
  locale: Locale;
  dict: Dictionary;
}) {
  if (priced.warnings.length === 0 && priced.issues.length === 0) return null;

  return (
    <div className="space-y-3">
      {priced.issues.length > 0 && (
        <section
          aria-labelledby="issues-heading"
          className="rounded-[var(--radius-r-lg)] border border-[color:var(--color-alert)] bg-[color:var(--color-alert-bg)] p-3"
        >
          <h3 id="issues-heading" className="mono mb-1 text-[10px] uppercase tracking-widest text-[color:var(--color-alert)]">
            {dict.issues}
          </h3>
          <ul className="space-y-1 text-[12px] text-[color:var(--color-ink-70)]">
            {priced.issues.map((issue, index) => (
              <li key={`${issue.code}-${issue.messageId}-${index}`}>
                <span className="mono text-[11px]">{issue.messageId}</span> · {issue.message[locale]}
              </li>
            ))}
          </ul>
        </section>
      )}

      {priced.warnings.length > 0 && (
        <section
          aria-labelledby="warnings-heading"
          className="rounded-[var(--radius-r-lg)] border border-[color:var(--color-ink-15)] bg-[color:var(--color-ink-04)] p-3"
        >
          <h3 id="warnings-heading" className="mono mb-1 text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
            {dict.dataWarnings}
          </h3>
          <ul className="space-y-1 text-[12px] text-[color:var(--color-ink-70)]">
            {priced.warnings.map((warning, index) => (
              <li key={`${warning.code}-${index}`}>
                <span className="mono text-[11px]">{warning.subject}</span> · {warning.message[locale]}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
