'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { PriceDecision } from '@dyvit/whatsapp-pricing';
import type { Dictionary, Locale } from '../i18n/dictionary';
import { clockTime, money } from '../lib/format';

interface Props {
  decision: PriceDecision | null;
  locale: Locale;
  dict: Dictionary;
  onClose: () => void;
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-t border-[color:var(--color-ink-07)] py-1.5">
      <dt className="mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">{label}</dt>
      <dd className="mono text-right text-[12px] text-[color:var(--color-ink)]">{children}</dd>
    </div>
  );
}

/**
 * The price trace: ruleset, rule, window state, rate, tier and the primary source.
 * Everything the spec asks a bubble to open, in one dialog.
 */
export function TraceDialog({ decision, locale, dict, onClose }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!decision) return;
    closeRef.current?.focus();
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [decision, onClose]);

  if (!decision) return null;

  const window = decision.windowState;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="trace-title"
        className="w-full max-w-md rounded-[var(--radius-r-lg)] border border-[color:var(--color-ink-15)] bg-[color:var(--color-paper)] p-5 shadow-xl"
      >
        <div className="mb-3 flex items-start justify-between gap-4">
          <h2 id="trace-title" className="text-[16px] font-extrabold tracking-[-0.04em]">
            {dict.trace}
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)] px-2.5 py-1 text-[12px] text-[color:var(--color-ink-70)] hover:bg-[color:var(--color-ink-04)]"
          >
            {dict.closeTrace}
          </button>
        </div>

        <p className="mb-3 text-[13px] leading-relaxed text-[color:var(--color-ink-70)]">
          {decision.explanation[locale]}
        </p>

        <dl>
          <Row label={dict.ruleset}>
            {decision.rulesetVersion} · {decision.effectiveAt}
          </Row>
          <Row label={dict.rule}>
            {decision.ruleId} · {decision.reasonCode}
          </Row>
          <Row label={dict.category}>
            {decision.category} · {decision.market}
          </Row>
          <Row label={dict.rate}>
            {decision.unitRate === null ? 'n/a' : money(decision.unitRate, decision.currency, locale)}
          </Row>
          <Row label={dict.tier}>{decision.tierApplied === null ? 'n/a' : `#${decision.tierApplied}`}</Row>
          <Row label={dict.windowLabel}>
            {window.cswOpen ? `CSW → ${clockTime(window.cswOpenUntil ?? '', locale)}` : dict.cswClosed}
            {window.fepActive ? ` · FEP → ${clockTime(window.fepActiveUntil ?? '', locale)}` : ''}
          </Row>
          <Row label="Total">
            {decision.billable ? money(decision.amount, decision.currency, locale) : dict.free}
          </Row>
        </dl>

        <a
          href={decision.sourceUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="mono mt-3 inline-block text-[11px] text-[color:var(--color-em)] underline underline-offset-2"
        >
          {dict.source} ↗
        </a>
      </div>
    </div>
  );
}
