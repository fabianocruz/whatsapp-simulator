'use client';

import type { ReactNode } from 'react';
import type { MsgStatus } from '@dyvit/whatsapp-pricing';
import { WA } from './wa-theme';

/**
 * WhatsApp-style bubbles, ported from the Dyvit dashboard simulator.
 *
 * Two differences from the dashboard's version, both because this product simulates rather
 * than converses: the ticks reflect the message's actual simulated status instead of always
 * showing "read", and each bubble carries a price chip underneath.
 */

/** WhatsApp's own inline formatting: *bold*, _italic_, ~strike~, ```mono```. */
function formatWhatsApp(text: string): ReactNode[] {
  const result: ReactNode[] = [];
  const pattern = /(\*(.+?)\*|_(.+?)_|~(.+?)~|```(.+?)```)/gs;
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  let key = 0;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) result.push(text.slice(lastIndex, match.index));
    if (match[2] != null) result.push(<strong key={key++}>{match[2]}</strong>);
    else if (match[3] != null) result.push(<em key={key++}>{match[3]}</em>);
    else if (match[4] != null) result.push(<s key={key++}>{match[4]}</s>);
    else if (match[5] != null)
      result.push(
        <code key={key++} className="mono" style={{ fontSize: '0.9em' }}>
          {match[5]}
        </code>,
      );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < text.length) result.push(text.slice(lastIndex));
  return result.length > 0 ? result : [text];
}

/**
 * Delivery ticks. Unlike the dashboard, which always renders the read state, this maps the
 * simulated status — and the distinction matters here, because `failed` is the one status
 * that produces no charge.
 */
function Ticks({ status }: { status: MsgStatus }) {
  if (status === 'failed') {
    return (
      <svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true">
        <circle cx="8" cy="8" r="6.5" fill="none" stroke={WA.failed} strokeWidth="1.4" />
        <path d="M8 4.6v4.2M8 11.1v.6" stroke={WA.failed} strokeWidth="1.4" strokeLinecap="round" />
      </svg>
    );
  }
  const color = status === 'read' ? WA.check : WA.checkPlain;
  return (
    <svg width="16" height="10" viewBox="0 0 16 10" fill="none" aria-hidden="true">
      <path d="M1.5 5.5L4.5 8.5L11.5 1.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      {status !== 'sent' && (
        <path d="M5.5 5.5L8.5 8.5L15.5 1.5" stroke={color} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.85" />
      )}
    </svg>
  );
}

interface BubbleProps {
  children: ReactNode;
  time: string;
  status?: MsgStatus;
  /** Rendered above the text, for the template category line. */
  header?: ReactNode;
  /** Rendered outside the bubble, for the price chip. */
  chip?: ReactNode;
  /** Button stack, rendered below the timestamp and edge to edge, as WhatsApp does. */
  actions?: ReactNode;
  /** Highlight ring, used when a tip points at this message. */
  highlighted?: boolean;
  onRemove?: () => void;
  removeLabel?: string;
}

function Bubble({
  children,
  time,
  status,
  header,
  chip,
  actions,
  highlighted,
  onRemove,
  removeLabel,
  outbound,
}: BubbleProps & { outbound: boolean }) {
  const background = outbound ? WA.outbound : WA.inbound;
  // Inline formatting applies to plain strings only; structured content arrives already
  // rendered and must not be re-parsed for asterisks.
  const formatted = typeof children === 'string' ? formatWhatsApp(children) : children;

  return (
    <li className={`group flex ${outbound ? 'justify-end' : 'justify-start'}`}>
      <div className={`relative flex max-w-[85%] flex-col ${outbound ? 'items-end' : 'items-start'}`}>
        <div className="relative">
          {/* Bubble tail */}
          <div
            className={`absolute top-0 h-0 w-0 ${outbound ? '-right-[6px]' : '-left-[6px]'}`}
            style={
              outbound
                ? { borderTop: `8px solid ${background}`, borderRight: '6px solid transparent' }
                : { borderTop: `8px solid ${background}`, borderLeft: '6px solid transparent' }
            }
            aria-hidden="true"
          />
          <div
            className={`overflow-hidden rounded-[10px] ${outbound ? 'rounded-tr-none' : 'rounded-tl-none'} ${
              highlighted ? 'outline-2 outline-offset-2 outline-[color:var(--color-em-lt)]' : ''
            }`}
            style={{ backgroundColor: background }}
          >
            <div className="px-3 py-2">
              {header}
              <div className="whitespace-pre-wrap break-words text-[14px] leading-[20px] text-white/95">{formatted}</div>
              <div className="mt-1 flex items-center justify-end gap-1" style={{ color: WA.timestamp }}>
                <span className="text-[11px] leading-none">{time}</span>
                {outbound && status && <Ticks status={status} />}
              </div>
            </div>
            {actions}
          </div>
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              aria-label={removeLabel}
              className="absolute -right-2 -top-2 hidden h-5 w-5 items-center justify-center rounded-full border border-white/20 bg-[#2A3942] text-[11px] leading-none text-white/80 shadow-sm group-focus-within:flex group-hover:flex"
            >
              ×
            </button>
          )}
        </div>
        {chip}
      </div>
    </li>
  );
}

export function InboundBubble(props: BubbleProps) {
  return <Bubble {...props} outbound={false} />;
}

export function OutboundBubble(props: BubbleProps) {
  return <Bubble {...props} outbound={true} />;
}

/**
 * The centred pill WhatsApp uses for its own notices. Window transitions belong in this
 * idiom: "this window closed" is a fact about the conversation, not a message in it.
 */
export function SystemMessage({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' }) {
  return (
    <li className="my-2 flex justify-center">
      <span
        className="mono rounded-full px-3 py-1.5 text-[11px]"
        style={
          tone === 'accent'
            ? { backgroundColor: 'rgba(10,110,74,0.28)', color: '#8FE3C0' }
            : { backgroundColor: WA.system, color: 'rgba(255,255,255,0.5)' }
        }
      >
        {children}
      </span>
    </li>
  );
}
