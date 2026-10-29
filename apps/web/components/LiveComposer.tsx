'use client';

import { useState, type FormEvent } from 'react';
import type { Dictionary } from '../i18n/dictionary';
import { sendInbound, type LiveStatus } from '../lib/live';

interface Props {
  dict: Dictionary;
  url: string;
  status: LiveStatus;
  /** The conversation the stream is showing; null until the emulator has one. */
  conversationKey: string | null;
}

/**
 * The customer's side of a live conversation, typed here instead of curled.
 *
 * Not optimistic on purpose: the bubble appears when the emulator broadcasts it, so what
 * the phone shows is always what the emulator recorded and priced, and a refused message
 * never looks sent.
 */
export function LiveComposer({ dict, url, status, conversationKey }: Props) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // While the stream is down the key may be stale (a restarted emulator has no
  // conversations), so the text is kept but nothing is sent until it reattaches.
  const ready = status === 'connected' && conversationKey !== null;
  const hint =
    status === 'connecting'
      ? dict.liveConnecting
      : status === 'error'
        ? dict.liveError
        : conversationKey
          ? dict.liveComposerHint
          : dict.liveComposerNoConversation;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const message = text.trim();
    if (!ready || !conversationKey || !message || sending) return;
    setSending(true);
    setError(null);
    const result = await sendInbound(url, conversationKey, message);
    setSending(false);
    if (result.ok) {
      setText('');
    } else if (result.reason === 'unreachable') {
      setError(`${dict.liveComposerUnreachable} ${url}`);
    } else {
      setError(`${dict.liveComposerRefused} ${result.status}${result.message ? ` · ${result.message}` : ''}`);
    }
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-[var(--radius-r-lg)] border border-[color:var(--color-ink-15)] bg-white p-4"
    >
      <h3 className="section-label mb-2">{dict.liveComposer}</h3>
      <div className="flex gap-2">
        <input
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setError(null);
          }}
          // Read-only while a send is in flight, so a success clearing the field never
          // eats what was typed in the meantime.
          readOnly={sending}
          aria-busy={sending}
          disabled={!conversationKey}
          placeholder={dict.liveComposerPlaceholder}
          aria-label={dict.liveComposerPlaceholder}
          className="min-w-0 flex-1 rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)] bg-white px-2.5 py-1.5 text-[13px] text-[color:var(--color-ink)] disabled:opacity-60 read-only:opacity-60"
        />
        <button
          type="submit"
          disabled={!ready || !text.trim() || sending}
          className="rounded-[var(--radius-r)] bg-[color:var(--color-ink)] px-3 py-1.5 text-[12px] text-[color:var(--color-paper)] disabled:opacity-40"
        >
          {dict.liveComposerSend}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-[12px] leading-relaxed text-[color:var(--color-alert)]">
          {error}
        </p>
      ) : (
        <p className="mt-2 text-[12px] leading-relaxed text-[color:var(--color-ink-40)]">
          {hint}
        </p>
      )}
    </form>
  );
}
