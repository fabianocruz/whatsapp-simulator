'use client';

import type { ReactNode } from 'react';
import type { PriceDecision, PricedConversation, SimMessage } from '@dyvit/whatsapp-pricing';
import type { Dictionary, Locale } from '../i18n/dictionary';
import { clockTime, shortDate } from '../lib/format';
import { PriceChip } from './PriceChip';
import { TickIcon } from './icons';

interface Props {
  messages: readonly SimMessage[];
  priced: PricedConversation;
  locale: Locale;
  dict: Dictionary;
  onOpenTrace: (decision: PriceDecision) => void;
  onRemove: (id: string) => void;
  highlighted: ReadonlySet<string>;
}

const CONTENT_GLYPH: Record<string, string> = {
  image: '🖼',
  audio: '🎙',
  video: '🎬',
  document: '📄',
  sticker: '🏷',
  location: '📍',
  interactive_buttons: '🔘',
  interactive_list: '📋',
  cta_url: '🔗',
  flow: '🧩',
};

/** A date separator, as WhatsApp shows when the conversation crosses midnight. */
function DayDivider({ iso, locale }: { iso: string; locale: Locale }) {
  return (
    <li className="my-3 flex justify-center">
      <span className="mono rounded-full bg-white/70 px-3 py-1 text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
        {shortDate(iso, locale)}
      </span>
    </li>
  );
}

/** A window transition marker drawn between bubbles. */
function WindowMarker({ text, tone }: { text: string; tone: 'em' | 'ink' }) {
  const classes =
    tone === 'em'
      ? 'border-[color:var(--color-em-border)] bg-[color:var(--color-em-bg)] text-[color:var(--color-em)]'
      : 'border-[color:var(--color-ink-15)] bg-white/70 text-[color:var(--color-ink-40)]';
  return (
    <li className="my-2 flex justify-center">
      <span className={`mono rounded-full border px-3 py-1 text-[10px] ${classes}`}>{text}</span>
    </li>
  );
}

export function PhoneFrame({ messages, priced, locale, dict, onOpenTrace, onRemove, highlighted }: Props) {
  const ordered = priced.decisions;

  const items: ReactNode[] = [];
  let previousDay = '';
  // Starts closed so a conversation that opens with a template does not lead with a
  // "window closed" marker; only actual transitions get one.
  let previousCsw = false;
  let previousFep = false;

  for (const decision of ordered) {
    const message = messages.find((m) => m.id === decision.messageId);
    if (!message) continue;

    const day = message.sentAt.slice(0, 10);
    if (day !== previousDay) {
      items.push(<DayDivider key={`day-${day}-${decision.messageId}`} iso={message.sentAt} locale={locale} />);
      previousDay = day;
    }

    // Window transitions get their own marker, because the window is what sets the price.
    const { cswOpen, cswOpenUntil, fepActive, fepActiveUntil } = decision.windowState;
    if (fepActive && !previousFep) {
      items.push(
        <WindowMarker
          key={`fep-${decision.messageId}`}
          tone="em"
          text={`${dict.fepActive} · ${clockTime(fepActiveUntil ?? message.sentAt, locale)}`}
        />,
      );
    }
    if (previousCsw !== cswOpen) {
      items.push(
        <WindowMarker
          key={`csw-${decision.messageId}`}
          tone={cswOpen ? 'em' : 'ink'}
          text={cswOpen ? `${dict.cswOpenUntil} ${clockTime(cswOpenUntil ?? message.sentAt, locale)}` : dict.cswClosed}
        />,
      );
    }
    previousCsw = cswOpen;
    previousFep = fepActive;

    const outbound = message.direction === 'business_to_user';
    const glyph = message.contentType ? CONTENT_GLYPH[message.contentType] : undefined;

    items.push(
      <li key={message.id} className={`group flex ${outbound ? 'justify-end' : 'justify-start'}`}>
        <div className={`max-w-[82%] ${outbound ? 'items-end text-right' : 'items-start text-left'} flex flex-col`}>
          <div
            className={`relative rounded-[14px] px-3 py-2 text-[13px] leading-snug shadow-sm ring-1 ${
              outbound ? 'bg-[#d9fdd3] ring-black/5' : 'bg-white ring-black/5'
            } ${highlighted.has(message.id) ? 'outline-2 outline-offset-2 outline-[color:var(--color-em)]' : ''}`}
          >
            {message.kind === 'template' && (
              <span className="mono mb-1 block text-[9px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
                {message.templateName ? `${message.category} · ${message.templateName}` : message.category}
              </span>
            )}
            <span className="whitespace-pre-wrap break-words text-[color:var(--color-ink)]">
              {glyph ? `${glyph} ` : ''}
              {message.bodyPreview || (glyph ? message.contentType : '…')}
            </span>
            <span className="mono ml-2 inline-flex translate-y-[2px] items-center gap-1 text-[10px] text-[color:var(--color-ink-40)]">
              {clockTime(message.sentAt, locale)}
              {outbound && <TickIcon status={message.status} />}
            </span>
            <button
              type="button"
              onClick={() => onRemove(message.id)}
              aria-label={`${dict.removeMessage}: ${message.id}`}
              className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-[color:var(--color-ink-15)] bg-white text-[11px] leading-none text-[color:var(--color-ink-70)] shadow-sm group-focus-within:flex group-hover:flex"
            >
              ×
            </button>
          </div>
          <PriceChip
            decision={decision}
            locale={locale}
            freeLabel={dict.free}
            traceLabel={dict.trace}
            onOpenTrace={onOpenTrace}
          />
        </div>
      </li>,
    );
  }

  return (
    <div className="mx-auto w-full max-w-[420px]">
      <div className="overflow-hidden rounded-[var(--radius-r-xl)] border border-[color:var(--color-ink-15)] bg-[color:var(--color-night)] p-2 shadow-lg">
        <div className="flex items-center gap-2 px-2 pb-2 pt-1">
          <span className="h-2 w-2 rounded-full bg-[color:var(--color-em)]" aria-hidden="true" />
          <span className="mono text-[10px] uppercase tracking-widest text-white/60">
            {priced.market} · {priced.currency} · {priced.ruleSet.id}
          </span>
        </div>
        <div className="wa-wallpaper overflow-hidden rounded-[var(--radius-r-lg)]">
          <div className="flex items-center gap-3 bg-[#075e54] px-4 py-3 text-white">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white/20 text-sm font-semibold">D</div>
            <div className="leading-tight">
              <div className="text-[13px] font-semibold">Dyvit Simulator</div>
              <div className="mono text-[10px] text-white/70">{dict.conversation}</div>
            </div>
          </div>
          <ul className="flex h-[520px] flex-col gap-2 overflow-y-auto p-3">
            {items.length === 0 ? (
              <li className="m-auto max-w-[80%] text-center text-[12px] text-[color:var(--color-ink-40)]">
                {dict.emptyConversation}
              </li>
            ) : (
              items
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
