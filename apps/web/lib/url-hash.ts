import type { SimMessage } from '@dyvit/whatsapp-pricing';
import type { SimulatorState } from './scenario-state';
import { emptyState } from './scenario-state';

/**
 * Scenario serialization for the URL hash.
 *
 * The state goes out as compact JSON, then UTF-8 bytes, then base64url. Going through
 * TextEncoder rather than `btoa(JSON.stringify(...))` is what keeps accented message
 * bodies — which every Brazilian scenario has — from throwing on encode.
 */

const VERSION = 1;

interface Wire {
  v: number;
  m: unknown[];
  mk: string;
  c: string;
  a: string;
  cpm: number;
  pn: number;
  cmp: 0 | 1;
  l: string;
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): Uint8Array {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** Drops undefined keys so two equal scenarios always serialize identically. */
function compactMessage(message: SimMessage): unknown {
  return Object.fromEntries(Object.entries(message).filter(([, value]) => value !== undefined && value !== ''));
}

export function encodeState(state: SimulatorState): string {
  const wire: Wire = {
    v: VERSION,
    m: state.messages.map(compactMessage),
    mk: state.market,
    c: state.currency,
    a: state.asOf,
    cpm: state.conversationsPerMonth,
    pn: state.phoneNumbers,
    cmp: state.compare ? 1 : 0,
    l: state.locale,
  };
  return toBase64Url(new TextEncoder().encode(JSON.stringify(wire)));
}

/**
 * Parses a hash back into state. A malformed or truncated link must never blank the app,
 * so anything unreadable falls back to an empty scenario.
 */
export function decodeState(hash: string): SimulatorState | null {
  const raw = hash.startsWith('#') ? hash.slice(1) : hash;
  if (!raw) return null;
  const value = raw.startsWith('s=') ? raw.slice(2) : raw;
  try {
    const wire = JSON.parse(new TextDecoder().decode(fromBase64Url(value))) as Partial<Wire>;
    if (wire.v !== VERSION || !Array.isArray(wire.m)) return null;
    const fallback = emptyState();
    return {
      messages: wire.m as SimMessage[],
      market: typeof wire.mk === 'string' ? wire.mk : fallback.market,
      currency: wire.c === 'USD' ? 'USD' : 'BRL',
      asOf: typeof wire.a === 'string' ? wire.a : fallback.asOf,
      conversationsPerMonth: Number.isFinite(wire.cpm) ? Number(wire.cpm) : 0,
      phoneNumbers: Number.isFinite(wire.pn) ? Number(wire.pn) : 1,
      compare: wire.cmp === 1,
      locale: wire.l === 'en' ? 'en' : 'pt',
    };
  } catch {
    return null;
  }
}

export function shareUrl(state: SimulatorState): string {
  if (typeof window === 'undefined') return '';
  const { origin, pathname } = window.location;
  return `${origin}${pathname}#s=${encodeState(state)}`;
}
