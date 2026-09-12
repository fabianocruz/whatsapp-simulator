import type { Currency, SimMessage } from '@dyvit/whatsapp-pricing';
import type { Locale } from '../i18n/dictionary';

/** Everything a shared link has to reproduce exactly. */
export interface SimulatorState {
  messages: SimMessage[];
  market: string;
  currency: Currency;
  /** ISO date selecting the ruleset, or 'today'. */
  asOf: string;
  conversationsPerMonth: number;
  phoneNumbers: number;
  compare: boolean;
  locale: Locale;
}

export const FUTURE_AS_OF = '2026-10-01';

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function emptyState(locale: Locale = 'pt'): SimulatorState {
  return {
    messages: [],
    market: 'BR',
    currency: 'BRL',
    asOf: todayIso(),
    conversationsPerMonth: 0,
    phoneNumbers: 1,
    compare: false,
    locale,
  };
}

/** Milliseconds the composer's quick jumps advance the conversation clock by. */
export const TIME_JUMPS = [
  { key: 'minutes5', ms: 5 * 60_000 },
  { key: 'hour1', ms: 60 * 60_000 },
  { key: 'day1', ms: 24 * 60 * 60_000 },
] as const;

/** Next default timestamp for the composer: just after the last message. */
export function nextTimestamp(messages: readonly SimMessage[]): string {
  if (messages.length === 0) return new Date().toISOString();
  const last = Math.max(...messages.map((m) => Date.parse(m.sentAt)));
  return new Date(last + 5 * 60_000).toISOString();
}

let counter = 0;

/**
 * Sequential ids rather than random ones: a shared scenario must serialize to the same
 * string for everyone, and `crypto.randomUUID` would make two identical conversations
 * produce two different links.
 */
export function nextMessageId(messages: readonly SimMessage[]): string {
  counter = Math.max(counter + 1, messages.length + 1);
  let candidate = `m${counter}`;
  const taken = new Set(messages.map((m) => m.id));
  while (taken.has(candidate)) {
    counter += 1;
    candidate = `m${counter}`;
  }
  return candidate;
}
