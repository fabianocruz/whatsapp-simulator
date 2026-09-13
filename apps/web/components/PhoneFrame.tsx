'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import type { PriceDecision, PricedConversation, SimMessage } from '@dyvit/whatsapp-pricing';
import type { Dictionary, Locale } from '../i18n/dictionary';
import { clockTime, shortDate } from '../lib/format';
import { InboundBubble, OutboundBubble, SystemMessage } from './ChatBubble';
import { splitContent } from './MessageContent';
import { DeviceChrome } from './DeviceChrome';
import { PriceChip } from './PriceChip';
import { WA } from './wa-theme';

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

export function PhoneFrame({ messages, priced, locale, dict, onOpenTrace, onRemove, highlighted }: Props) {
  const chatRef = useRef<HTMLDivElement>(null);

  // Pin the view to the newest message, the way a real chat does. Without this a message
  // you just added is born off-screen, and it is the one whose price you wanted to see.
  useEffect(() => {
    const element = chatRef.current;
    if (element) element.scrollTop = element.scrollHeight;
  }, [priced.decisions]);

  const items: ReactNode[] = [];
  let previousDay = '';
  // Starts closed so a conversation that opens with a template does not lead with a
  // "window closed" marker; only actual transitions get one.
  let previousCsw = false;
  let previousFep = false;

  for (const decision of priced.decisions) {
    const message = messages.find((m) => m.id === decision.messageId);
    if (!message) continue;

    const day = message.sentAt.slice(0, 10);
    if (day !== previousDay) {
      items.push(
        <SystemMessage key={`day-${day}-${decision.messageId}`}>{shortDate(message.sentAt, locale)}</SystemMessage>,
      );
      previousDay = day;
    }

    const { cswOpen, cswOpenUntil, fepActive, fepActiveUntil } = decision.windowState;
    if (fepActive && !previousFep) {
      items.push(
        <SystemMessage key={`fep-${decision.messageId}`} tone="accent">
          {`${dict.fepActive} · ${clockTime(fepActiveUntil ?? message.sentAt, locale)}`}
        </SystemMessage>,
      );
    }
    if (previousCsw !== cswOpen) {
      items.push(
        <SystemMessage key={`csw-${decision.messageId}`} tone={cswOpen ? 'accent' : 'neutral'}>
          {cswOpen ? `${dict.cswOpenUntil} ${clockTime(cswOpenUntil ?? message.sentAt, locale)}` : dict.cswClosed}
        </SystemMessage>,
      );
    }
    previousCsw = cswOpen;
    previousFep = fepActive;

    // Structured content renders as the real thing: media header, footer, buttons, list.
    // A hand-written scenario without it still gets a plain bubble with a type glyph.
    const glyph = message.contentType ? CONTENT_GLYPH[message.contentType] : undefined;
    const split = message.content ? splitContent(message.content) : null;
    const body: ReactNode =
      split?.body ?? `${glyph ? `${glyph} ` : ''}${message.bodyPreview || (glyph ? message.contentType : '…')}`;

    const header =
      message.kind === 'template' ? (
        <span className="mono mb-1 block text-[9px] uppercase tracking-widest text-white/45">
          {message.templateName ? `${message.category} · ${message.templateName}` : message.category}
        </span>
      ) : undefined;

    const chip = (
      <PriceChip
        decision={decision}
        locale={locale}
        traceLabel={dict.trace}
        onOpenTrace={onOpenTrace}
      />
    );

    const common = {
      time: clockTime(message.sentAt, locale),
      chip,
      highlighted: highlighted.has(message.id),
      onRemove: () => onRemove(message.id),
      removeLabel: `${dict.removeMessage}: ${message.id}`,
      ...(header ? { header } : {}),
      ...(split?.actions ? { actions: split.actions } : {}),
    };

    items.push(
      message.direction === 'business_to_user' ? (
        <OutboundBubble key={message.id} {...common} status={message.status}>
          {body}
        </OutboundBubble>
      ) : (
        <InboundBubble key={message.id} {...common}>
          {body}
        </InboundBubble>
      ),
    );
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <DeviceChrome
        contactName="Dyvit Simulator"
        subtitle={`${priced.market} · ${priced.currency}`}
        // A fixed clock, not the viewer's: a shared scenario has to render identically for
        // everyone who opens the link.
        clock={clockTime(messages[0]?.sentAt ?? priced.asOf, locale)}
        inputPlaceholder={dict.composer}
      >
        <div
          ref={chatRef}
          className="wa-scroll flex-1 space-y-1 overflow-y-auto px-3 py-3"
          style={{
            background: WA.chatBg,
            backgroundImage: `
              radial-gradient(circle at 20% 50%, rgba(255,255,255,0.012) 1px, transparent 1px),
              radial-gradient(circle at 80% 20%, rgba(255,255,255,0.012) 1px, transparent 1px),
              radial-gradient(circle at 40% 80%, rgba(255,255,255,0.008) 1px, transparent 1px)
            `,
            backgroundSize: '60px 60px',
          }}
        >
          {items.length === 0 ? (
            <p className="m-auto max-w-[80%] py-16 text-center text-[12px] text-white/40">{dict.emptyConversation}</p>
          ) : (
            <ul className="space-y-1">{items}</ul>
          )}
        </div>
      </DeviceChrome>

      <p className="mono text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
        {priced.ruleSet.id}
      </p>
    </div>
  );
}
