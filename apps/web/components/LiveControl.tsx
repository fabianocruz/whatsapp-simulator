'use client';

import type { Dictionary } from '../i18n/dictionary';
import type { LiveStatus } from '../lib/live';

interface Props {
  dict: Dictionary;
  status: LiveStatus;
  url: string;
  messageCount: number;
  onUrlChange: (url: string) => void;
  onToggle: () => void;
}

const DOT: Record<LiveStatus, string> = {
  off: 'bg-[color:var(--color-ink-40)]',
  connecting: 'bg-[color:var(--color-ink-40)] animate-pulse',
  connected: 'bg-[color:var(--color-em)]',
  error: 'bg-[color:var(--color-alert)]',
};

/**
 * Attaches the phone frame to a local `dyvit-wa-sim serve`.
 *
 * The live dot is the one place in this product where emerald means "running", which is
 * exactly what the brand reserves it for.
 */
export function LiveControl({ dict, status, url, messageCount, onUrlChange, onToggle }: Props) {
  const label: Record<LiveStatus, string> = {
    off: dict.liveOff,
    connecting: dict.liveConnecting,
    connected: `${dict.liveConnected} · ${messageCount}`,
    error: dict.liveError,
  };
  const on = status !== 'off';

  return (
    <section
      className={`rounded-[var(--radius-r-lg)] border p-4 ${
        status === 'connected'
          ? 'border-[color:var(--color-em-border)] bg-[color:var(--color-em-bg)]'
          : 'border-[color:var(--color-ink-15)] bg-white'
      }`}
      aria-labelledby="live-heading"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h3 id="live-heading" className="section-label flex items-center gap-2">
          <span className={`h-2 w-2 rounded-full ${DOT[status]}`} aria-hidden="true" />
          {dict.live}
        </h3>

        <input
          type="url"
          value={url}
          onChange={(event) => onUrlChange(event.target.value)}
          disabled={on}
          aria-label={dict.liveOff}
          className="mono min-w-[220px] flex-1 rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)] bg-white px-2.5 py-1.5 text-[12px] disabled:opacity-60"
        />

        <button
          type="button"
          onClick={onToggle}
          aria-pressed={on}
          className={`rounded-[var(--radius-r)] px-3 py-1.5 text-[12px] ${
            on
              ? 'border border-[color:var(--color-ink-15)] bg-white text-[color:var(--color-ink-70)]'
              : 'bg-[color:var(--color-ink)] text-[color:var(--color-paper)]'
          }`}
        >
          {on ? dict.liveDisconnect : label[status]}
        </button>
      </div>

      <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--color-ink-70)]">
        {status === 'connected' ? dict.liveReadOnly : status === 'error' ? dict.liveError : dict.liveHint}
      </p>
    </section>
  );
}
