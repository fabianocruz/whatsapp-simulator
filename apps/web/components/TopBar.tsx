'use client';

import type { Currency } from '@dyvit/whatsapp-pricing';
import { SCENARIOS } from '@dyvit/whatsapp-scenarios';
import type { Dictionary, Locale } from '../i18n/dictionary';
import { FUTURE_AS_OF, todayIso, type SimulatorState } from '../lib/scenario-state';

interface Props {
  state: SimulatorState;
  dict: Dictionary;
  markets: ReadonlyArray<{ market: string; currency: Currency; name: { pt: string; en: string } }>;
  shareLabel: string;
  onChange: (patch: Partial<SimulatorState>) => void;
  onLoadScenario: (slug: string) => void;
  onShare: () => void;
  onExportCsv: () => void;
  onExportJson: () => void;
  onReset: () => void;
}

const control =
  'rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)] bg-white px-2.5 py-1.5 text-[12px] text-[color:var(--color-ink)]';
const label = 'mono mb-1 block text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]';
const button =
  'rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)] bg-white px-3 py-1.5 text-[12px] text-[color:var(--color-ink-70)] hover:bg-[color:var(--color-ink-04)]';

export function TopBar({
  state,
  dict,
  markets,
  shareLabel,
  onChange,
  onLoadScenario,
  onShare,
  onExportCsv,
  onExportJson,
  onReset,
}: Props) {
  const isFuture = state.asOf === FUTURE_AS_OF;

  return (
    <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-r-lg)] border border-[color:var(--color-ink-15)] bg-white p-4">
      <label className="block">
        <span className={label}>{dict.market}</span>
        <select
          className={control}
          value={`${state.market}/${state.currency}`}
          onChange={(event) => {
            const [market, currency] = event.target.value.split('/');
            onChange({ market: market!, currency: currency as Currency });
          }}
        >
          {markets.map((entry) => (
            <option key={`${entry.market}/${entry.currency}`} value={`${entry.market}/${entry.currency}`}>
              {entry.name.pt} · {entry.currency}
            </option>
          ))}
        </select>
      </label>

      <div>
        <span className={label}>{dict.rulesAsOf}</span>
        <div className="flex overflow-hidden rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)]">
          <button
            type="button"
            aria-pressed={!isFuture}
            onClick={() => onChange({ asOf: todayIso() })}
            className={`px-3 py-1.5 text-[12px] ${
              !isFuture ? 'bg-[color:var(--color-ink)] text-[color:var(--color-paper)]' : 'bg-white text-[color:var(--color-ink-70)]'
            }`}
          >
            {dict.today}
          </button>
          <button
            type="button"
            aria-pressed={isFuture}
            onClick={() => onChange({ asOf: FUTURE_AS_OF })}
            className={`px-3 py-1.5 text-[12px] ${
              isFuture ? 'bg-[color:var(--color-ink)] text-[color:var(--color-paper)]' : 'bg-white text-[color:var(--color-ink-70)]'
            }`}
          >
            {dict.october}
          </button>
        </div>
      </div>

      <label className="block">
        <span className={label}>{dict.conversationsPerMonth}</span>
        <input
          type="number"
          min={0}
          step={100}
          className={`${control} w-28`}
          value={state.conversationsPerMonth}
          onChange={(event) => onChange({ conversationsPerMonth: Math.max(0, Number(event.target.value) || 0) })}
        />
      </label>

      <label className="block">
        <span className={label}>{dict.phoneNumbers}</span>
        <input
          type="number"
          min={1}
          step={1}
          className={`${control} w-20`}
          value={state.phoneNumbers}
          onChange={(event) => onChange({ phoneNumbers: Math.max(1, Number(event.target.value) || 1) })}
        />
      </label>

      <label className="block">
        <span className={label}>{dict.scenario}</span>
        <select className={control} value="" onChange={(event) => event.target.value && onLoadScenario(event.target.value)}>
          <option value="">{dict.loadScenario}</option>
          {SCENARIOS.map((scenario) => (
            <option key={scenario.slug} value={scenario.slug}>
              {scenario.name}
            </option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className={label}>{dict.language}</span>
        <select
          className={control}
          value={state.locale}
          onChange={(event) => onChange({ locale: event.target.value as Locale })}
        >
          <option value="pt">PT-BR</option>
          <option value="en">EN</option>
        </select>
      </label>

      <label className="ml-auto flex cursor-pointer items-center gap-2 self-center text-[12px] text-[color:var(--color-ink-70)]">
        <input
          type="checkbox"
          checked={state.compare}
          onChange={(event) => onChange({ compare: event.target.checked })}
          className="h-4 w-4 accent-[color:var(--color-em)]"
        />
        {dict.compareToggle}
      </label>

      <div className="flex gap-2 self-center">
        <button type="button" className={button} onClick={onShare}>
          {shareLabel}
        </button>
        <button type="button" className={button} onClick={onExportCsv}>
          {dict.exportCsv}
        </button>
        <button type="button" className={button} onClick={onExportJson}>
          {dict.exportJson}
        </button>
        <button type="button" className={button} onClick={onReset}>
          {dict.reset}
        </button>
      </div>
    </div>
  );
}
