'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { formatWhatsApp } from './ChatBubble';
import type { MessageButton, MessageContent as Content, MessageHeader } from '@dyvit/whatsapp-pricing';
import { WA } from './wa-theme';

/**
 * Renders what the Cloud API actually sends.
 *
 * A real application does not send paragraphs: it sends templates with media headers and
 * quick replies, option lists, Flows. Drawing those is the difference between a mockup of
 * a conversation and a simulator you can point your own app at and recognise the output.
 *
 * Everything here is inert on purpose. Buttons render, and do nothing: this is a
 * reproduction of a screen, not a WhatsApp client, and a button that looked clickable but
 * changed nothing would be a worse lie than one that is visibly flat.
 */

function MediaBlock({ media, filename }: { media: string; filename?: string }) {
  const label: Record<string, string> = {
    image: 'Imagem',
    video: 'Vídeo',
    document: filename ?? 'Documento',
    audio: 'Áudio',
    sticker: 'Figurinha',
  };

  if (media === 'audio') {
    return (
      <div className="mb-1 flex items-center gap-2 rounded-[6px] bg-black/20 px-2 py-2">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-white/70">
          <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="1.4" />
          <path d="M10 8.5v7l6-3.5-6-3.5z" fill="currentColor" />
        </svg>
        {/* A static waveform: the shape communicates "voice note" faster than any label. */}
        <svg width="120" height="20" viewBox="0 0 120 20" aria-hidden="true" className="text-white/45">
          {Array.from({ length: 30 }, (_, i) => {
            const h = 3 + ((i * 7) % 13);
            return <rect key={i} x={i * 4} y={(20 - h) / 2} width="2" height={h} rx="1" fill="currentColor" />;
          })}
        </svg>
      </div>
    );
  }

  if (media === 'sticker') {
    return (
      <div className="mb-1 flex h-[92px] w-[92px] items-center justify-center rounded-[8px] bg-white/5 text-[32px]">
        🏷
      </div>
    );
  }

  if (media === 'document') {
    return (
      <div className="mb-1 flex items-center gap-2 rounded-[6px] bg-black/25 px-2.5 py-2">
        <svg width="22" height="26" viewBox="0 0 22 26" fill="none" aria-hidden="true" className="shrink-0 text-white/70">
          <path d="M3 1h11l5 5v19H3z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M14 1v5h5" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        <span className="truncate text-[12px] text-white/80">{label[media]}</span>
      </div>
    );
  }

  // Image and video: a neutral placeholder block, because the simulator never fetches media.
  return (
    <div
      className="mb-1 flex h-[140px] w-full items-center justify-center rounded-[8px] bg-black/25"
      aria-label={label[media] ?? media}
    >
      <span className="mono text-[10px] uppercase tracking-widest text-white/35">{label[media] ?? media}</span>
      {media === 'video' && (
        <svg width="34" height="34" viewBox="0 0 24 24" className="absolute text-white/70" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="rgba(0,0,0,0.45)" />
          <path d="M10 8l6 4-6 4V8z" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}

function HeaderBlock({ header }: { header: MessageHeader }) {
  if (header.type === 'text') {
    return <div className="mb-1 text-[14px] font-semibold leading-snug text-white/95">{header.text}</div>;
  }
  return <MediaBlock media={header.type} {...(header.filename ? { filename: header.filename } : {})} />;
}

const BUTTON_ICON: Record<MessageButton['type'], string | null> = {
  quick_reply: null,
  url: 'M10 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4M14 4h6v6M10 14 20 4',
  phone_number: 'M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z',
  copy_code: 'M8 8h11v11H8zM5 16H3V3h13v2',
};

/** WhatsApp's reply buttons: stacked, full width, separated by a hairline. */
function Buttons({ buttons }: { buttons: MessageButton[] }) {
  if (buttons.length === 0) return null;
  return (
    <div>
      {buttons.map((button, index) => (
        <div
          key={`${button.text}-${index}`}
          className="flex items-center justify-center gap-1.5 border-t px-3 py-2 text-[13px] text-[#53BDEB]"
          style={{ borderColor: 'rgba(255,255,255,0.12)' }}
        >
          {BUTTON_ICON[button.type] && (
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d={BUTTON_ICON[button.type]!} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
          <span className="truncate">{button.text}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Splits a message into what sits above the timestamp and what sits below it.
 *
 * WhatsApp puts the clock and the ticks at the bottom right of the body, and the button
 * stack *under* that, separated by a hairline that runs edge to edge. Rendering buttons as
 * part of the body pushes the timestamp below them, which is the one detail that makes a
 * reproduction look wrong to anyone who uses the app daily.
 */
export function splitContent(content: Content): { body: ReactNode; actions: ReactNode | null } {
  const actions =
    content.kind === 'template' || content.kind === 'buttons'
      ? content.buttons && content.buttons.length > 0
        ? <Buttons buttons={content.buttons} />
        : null
      : content.kind === 'list'
        ? <ListAction content={content} />
        : content.kind === 'flow'
          ? <FlowAction content={content} />
          : content.kind === 'order'
            ? <OrderAction content={content} />
            : null;

  return { body: <MessageContentView content={content} />, actions };
}

function ActionRow({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div
      className="flex items-center justify-center gap-1.5 border-t px-3 py-2 text-[13px] text-[#53BDEB]"
      style={{ borderColor: 'rgba(255,255,255,0.12)' }}
    >
      {icon}
      <span className="truncate">{label}</span>
    </div>
  );
}

function ListAction({ content }: { content: Extract<Content, { kind: 'list' }> }) {
  return (
    <ActionRow
      label={content.buttonText}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      }
    />
  );
}

function FlowAction({ content }: { content: Extract<Content, { kind: 'flow' }> }) {
  return (
    <ActionRow
      label={content.ctaText}
      icon={
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.6" />
          <path d="M7 8h10M7 12h10M7 16h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      }
    />
  );
}

type Order = Extract<Content, { kind: 'order' }>;

function money(minor: number, currency: string): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(minor / 100);
}

const BAG_ICON = 'M6 7h12l1 13H5L6 7zM9 7V6a3 3 0 0 1 6 0v1';

/** The top of an order card: what is being paid and the total, the way WhatsApp leads with it. */
function OrderSummary({ content }: { content: Order }) {
  const count = content.items.reduce((n, item) => n + item.quantity, 0) || 1;
  const title = content.items[0]?.name ?? 'Pedido';
  return (
    <div className="-mx-1 -mt-0.5 mb-2 flex items-center gap-3 rounded-[8px] bg-black/20 p-2.5">
      <div className="flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-[6px] bg-white/10 text-white/80">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d={BAG_ICON} stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
        </svg>
      </div>
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px] font-medium text-white/95">{title}</div>
        <div className="text-[12px] text-white/55">
          {count} {count === 1 ? 'item' : 'itens'} · <span className="font-semibold text-white/90">{money(content.totalMinor, content.currency)}</span>
        </div>
      </div>
    </div>
  );
}

/**
 * "Revisar e pagar". In the app it opens a sheet with the order and the ways to pay; here
 * it opens the same sheet over the chat, and copying really copies the string that arrived.
 */
function OrderAction({ content }: { content: Order }) {
  const [open, setOpen] = useState(false);
  const [root, setRoot] = useState<HTMLElement | null>(null);
  useEffect(() => setRoot(document.getElementById('wa-sheet-root')), []);
  return (
    <>
      <button type="button" className="block w-full" onClick={() => setOpen(true)}>
        <ActionRow
          label="Revisar e pagar"
          icon={
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d={BAG_ICON} stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
            </svg>
          }
        />
      </button>
      {open && root && createPortal(<OrderSheet content={content} onClose={() => setOpen(false)} />, root)}
    </>
  );
}

function OrderSheet({ content, onClose }: { content: Order; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (label: string, value: string) => {
    void navigator.clipboard?.writeText(value).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 1800);
  };
  return (
    <div className="pointer-events-auto absolute inset-0 flex flex-col justify-end bg-black/50" onClick={onClose}>
      <div className="rounded-t-[16px] px-4 pb-6 pt-2" style={{ background: '#1F2C34' }} onClick={(e) => e.stopPropagation()}>
        <div className="mx-auto mb-3 h-1 w-9 rounded-full bg-white/25" />
        <div className="mb-3 text-center text-[15px] font-semibold text-white/95">Revisar pedido</div>
        {content.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between border-b border-white/10 py-2 text-[13px] text-white/85">
            <span className="min-w-0 truncate pr-3">
              {item.quantity}× {item.name}
            </span>
            <span className="shrink-0">{money(item.amountMinor * item.quantity, content.currency)}</span>
          </div>
        ))}
        <div className="flex items-center justify-between py-2.5 text-[15px] font-semibold text-white/95">
          <span>Total</span>
          <span>{money(content.totalMinor, content.currency)}</span>
        </div>
        {content.pix && (
          <div className="mt-1 rounded-[10px] bg-black/25 p-3">
            <div className="text-[13px] font-medium text-white/90">Pagar com Pix</div>
            {content.pix.merchantName && !/6304STUB$/.test(content.pix.code) && <div className="mt-0.5 text-[12px] text-white/50">Recebedor: {content.pix.merchantName}</div>}
            <div className="mt-1 text-[12px] leading-snug text-white/55">Copie o código e cole no app do seu banco, na opção Pix Copia e Cola.</div>
            <button
              type="button"
              className="mt-2.5 w-full rounded-full py-2 text-[14px] font-semibold text-[#0B141A]"
              style={{ background: '#21C063' }}
              onClick={() => copy('pix', content.pix!.code)}
            >
              {copied === 'pix' ? 'Código copiado' : 'Copiar código Pix'}
            </button>
          </div>
        )}
        {content.boleto && (
          <button
            type="button"
            className="mt-2 w-full rounded-full border border-white/20 py-2 text-[14px] text-[#53BDEB]"
            onClick={() => copy('boleto', content.boleto!)}
          >
            {copied === 'boleto' ? 'Linha digitável copiada' : 'Copiar linha digitável do boleto'}
          </button>
        )}
      </div>
    </div>
  );
}

function MessageContentView({ content }: { content: Content }) {
  switch (content.kind) {
    case 'text':
      return <span className="whitespace-pre-wrap break-words">{formatWhatsApp(content.body)}</span>;

    case 'media':
      return (
        <>
          <MediaBlock media={content.media} {...(content.filename ? { filename: content.filename } : {})} />
          {content.caption && <span className="whitespace-pre-wrap break-words">{content.caption}</span>}
        </>
      );

    case 'location':
      return (
        <>
          <div className="mb-1 flex h-[110px] w-full items-center justify-center rounded-[8px] bg-black/25 text-[26px]">📍</div>
          {(content.name || content.address) && (
            <span className="block text-[13px] leading-snug">
              {content.name && <strong className="block font-semibold">{content.name}</strong>}
              {content.address && <span className="text-white/70">{content.address}</span>}
            </span>
          )}
        </>
      );

    case 'template':
    case 'buttons':
      return (
        <>
          {content.header && <HeaderBlock header={content.header} />}
          <span className="whitespace-pre-wrap break-words">{formatWhatsApp(content.body)}</span>
          {content.footer && <span className="mt-1 block text-[12px] text-white/45">{content.footer}</span>}
        </>
      );

    case 'list':
      return (
        <>
          {content.header && <div className="mb-1 text-[14px] font-semibold text-white/95">{content.header}</div>}
          <span className="whitespace-pre-wrap break-words">{formatWhatsApp(content.body)}</span>
          {content.footer && <span className="mt-1 block text-[12px] text-white/45">{content.footer}</span>}
          {/* The sheet WhatsApp opens, shown inline: a collapsed list hides the very thing
              the developer is trying to check. */}
          {content.sections.length > 0 && (
            <div className="mt-2 space-y-1.5 rounded-[8px] bg-black/20 p-2">
              {content.sections.map((section, si) => (
                <div key={si}>
                  {section.title && (
                    <div className="mono mb-1 text-[9px] uppercase tracking-widest text-white/40">{section.title}</div>
                  )}
                  {section.rows.map((row) => (
                    <div key={row.id || row.title} className="border-b border-white/5 py-1 last:border-0">
                      <div className="text-[13px] text-white/90">{row.title}</div>
                      {row.description && <div className="text-[11px] text-white/50">{row.description}</div>}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </>
      );

    case 'order':
      return (
        <>
          <OrderSummary content={content} />
          <span className="whitespace-pre-wrap break-words">{formatWhatsApp(content.body)}</span>
          {content.footer && <span className="mt-1 block text-[12px] text-white/45">{content.footer}</span>}
        </>
      );

    case 'flow':
      return (
        <>
          {content.header && <div className="mb-1 text-[14px] font-semibold text-white/95">{content.header}</div>}
          <span className="whitespace-pre-wrap break-words">{formatWhatsApp(content.body)}</span>
          {content.footer && <span className="mt-1 block text-[12px] text-white/45">{content.footer}</span>}
        </>
      );
  }
}

export { WA };
