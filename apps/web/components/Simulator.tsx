'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  compareRulesets,
  listMarkets,
  priceConversation,
  projectMonthly,
  volumeFromConversation,
} from '@dyvit/whatsapp-pricing';
import type { PriceDecision, SimMessage } from '@dyvit/whatsapp-pricing';
import { getScenario } from '@dyvit/whatsapp-scenarios';
import { generateTips } from '@dyvit/whatsapp-tips';
import { t } from '../i18n/dictionary';
import { download, toCsv, toJson } from '../lib/export';
import {
  FUTURE_AS_OF,
  emptyState,
  nextMessageId,
  nextTimestamp,
  type SimulatorState,
} from '../lib/scenario-state';
import { decodeState, encodeState, shareUrl } from '../lib/url-hash';
import { Composer } from './Composer';
import { Notices } from './Notices';
import { PhoneFrame } from './PhoneFrame';
import { Taximeter } from './Taximeter';
import { TipsPanel } from './TipsPanel';
import { TopBar } from './TopBar';
import { TraceDialog } from './TraceDialog';

const MARKETS = listMarkets();

/** Scenario loaded on a first visit, so the page is never an empty canvas. */
const DEFAULT_SCENARIO = 'worked-example-spec';

export function Simulator() {
  // `null` until the hash has been read, so the server-rendered HTML and the first client
  // render agree. Static export prerenders this component; reading location during render
  // would produce a hydration mismatch.
  const [state, setState] = useState<SimulatorState | null>(null);
  const [trace, setTrace] = useState<PriceDecision | null>(null);
  const [highlighted, setHighlighted] = useState<ReadonlySet<string>>(new Set());
  const [justShared, setJustShared] = useState(false);
  const shareTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const fromHash = decodeState(window.location.hash);
    if (fromHash) {
      setState(fromHash);
      return;
    }
    const scenario = getScenario(DEFAULT_SCENARIO);
    setState({
      ...emptyState(),
      messages: scenario.messages.map((m) => ({ ...m })),
      market: scenario.market,
      currency: scenario.currency,
      asOf: scenario.asOf,
    });
  }, []);

  // Keep the hash in step with the state so a copied URL is always the live scenario.
  useEffect(() => {
    if (!state) return;
    const encoded = `#s=${encodeState(state)}`;
    if (window.location.hash !== encoded) {
      window.history.replaceState(null, '', encoded);
    }
  }, [state]);

  useEffect(() => () => {
    if (shareTimer.current) clearTimeout(shareTimer.current);
  }, []);

  const patch = useCallback((change: Partial<SimulatorState>) => {
    setState((current) => (current ? { ...current, ...change } : current));
  }, []);

  const addMessage = useCallback((message: Omit<SimMessage, 'id'>) => {
    setState((current) => {
      if (!current) return current;
      const id = nextMessageId(current.messages);
      return { ...current, messages: [...current.messages, { ...message, id }] };
    });
  }, []);

  const removeMessage = useCallback((id: string) => {
    setState((current) =>
      current ? { ...current, messages: current.messages.filter((message) => message.id !== id) } : current,
    );
  }, []);

  const loadScenario = useCallback((slug: string) => {
    setState((current) => {
      const scenario = getScenario(slug);
      return {
        ...(current ?? emptyState()),
        messages: scenario.messages.map((message) => ({ ...message })),
        market: scenario.market,
        currency: scenario.currency,
        asOf: scenario.asOf,
      };
    });
  }, []);

  const highlight = useCallback((ids: readonly string[]) => {
    setHighlighted(new Set(ids));
  }, []);

  /**
   * Everything downstream of the timeline, recomputed together. The engine is pure and a
   * conversation is tens of messages, so one memo over the whole pipeline is both simpler
   * and cheaper than threading separate ones.
   */
  const analysis = useMemo(() => {
    if (!state) return null;
    const options = { asOf: state.asOf, market: state.market, currency: state.currency };
    try {
      const priced = priceConversation(state.messages, options);
      const future =
        priced.ruleSet.id === 'ruleset-2026-10-01'
          ? priced
          : priceConversation(state.messages, { ...options, asOf: FUTURE_AS_OF });
      const tips = generateTips({
        priced,
        future,
        messages: state.messages,
        conversationsPerMonth: state.conversationsPerMonth,
        phoneNumbers: state.phoneNumbers,
      });
      const comparison = state.compare ? compareRulesets(state.messages, options, FUTURE_AS_OF) : null;
      const projection =
        state.conversationsPerMonth > 0
          ? projectMonthly(volumeFromConversation(priced, state.conversationsPerMonth), {
              ...options,
              phoneNumbers: state.phoneNumbers,
            })
          : null;
      return { priced, tips, comparison, projection, error: null as string | null };
    } catch (error) {
      // A market/date combination with no rate card is a user-reachable state, not a crash.
      return {
        priced: null,
        tips: [],
        comparison: null,
        projection: null,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }, [state]);

  if (!state || !analysis) {
    return <main className="p-10 text-[13px] text-[color:var(--color-ink-40)]">…</main>;
  }

  const dict = t(state.locale);
  // Pulled into a local const so TypeScript narrows it across every callback below.
  const priced = analysis.priced;

  function share() {
    const url = shareUrl(state!);
    void navigator.clipboard?.writeText(url).catch(() => {});
    setJustShared(true);
    if (shareTimer.current) clearTimeout(shareTimer.current);
    shareTimer.current = setTimeout(() => setJustShared(false), 2_000);
  }

  return (
    <>
      <a href="#main" className="skip-link">
        {dict.skipToContent}
      </a>

      <header className="mx-auto w-full max-w-[1240px] px-5 pt-10 pb-6 sm:px-8">
        <p className="section-label">Dyvit · open source</p>
        <h1 className="mt-2 text-[clamp(28px,4vw,44px)] leading-[1.05]">{dict.title}</h1>
        <p className="mt-2 max-w-2xl text-[15px] text-[color:var(--color-ink-70)]">{dict.tagline}</p>
        <p className="mt-2 max-w-2xl text-[13px] text-[color:var(--color-ink-40)]">{dict.intro}</p>
      </header>

      <main id="main" className="mx-auto w-full max-w-[1240px] px-5 pb-16 sm:px-8">
        <TopBar
          state={state}
          dict={dict}
          markets={MARKETS}
          shareLabel={justShared ? dict.shared : dict.share}
          onChange={patch}
          onLoadScenario={loadScenario}
          onShare={share}
          onExportCsv={() =>
            priced && download('dyvit-whatsapp-breakdown.csv', toCsv(priced), 'text/csv')
          }
          onExportJson={() =>
            priced &&
            download('dyvit-whatsapp-scenario.json', toJson(state, priced, analysis.tips), 'application/json')
          }
          onReset={() => setState(emptyState(state.locale))}
        />

        {analysis.error || !priced ? (
          <p className="mt-6 rounded-[var(--radius-r-lg)] border border-[color:var(--color-alert)] bg-[color:var(--color-alert-bg)] p-4 text-[13px] text-[color:var(--color-alert)]">
            {analysis.error}
          </p>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,440px)_minmax(0,1fr)]">
            <section aria-label={dict.conversation}>
              <PhoneFrame
                messages={state.messages}
                priced={priced}
                locale={state.locale}
                dict={dict}
                onOpenTrace={setTrace}
                onRemove={removeMessage}
                highlighted={highlighted}
              />
            </section>

            <div className="space-y-6">
              <div className="grid gap-6 sm:grid-cols-2">
                <Composer dict={dict} defaultSentAt={nextTimestamp(state.messages)} onAdd={addMessage} />
                <Taximeter
                  priced={priced}
                  comparison={analysis.comparison}
                  projection={analysis.projection}
                  locale={state.locale}
                  dict={dict}
                />
              </div>
              <TipsPanel
                tips={analysis.tips}
                locale={state.locale}
                dict={dict}
                currency={state.currency}
                onHighlight={highlight}
              />
              <Notices priced={priced} locale={state.locale} dict={dict} />
            </div>
          </div>
        )}

        <p className="mt-10 max-w-3xl text-[12px] leading-relaxed text-[color:var(--color-ink-40)]">
          {dict.disclaimer}
        </p>
      </main>

      <TraceDialog decision={trace} locale={state.locale} dict={dict} onClose={() => setTrace(null)} />
    </>
  );
}
