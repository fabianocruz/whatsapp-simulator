import type { SimMessage } from '@dyvit/whatsapp-pricing';

/**
 * Live connection to a local `dyvit-wa-sim serve`.
 *
 * The point of the whole product is the loop the spec calls the release gate: point your
 * application at localhost, send what you already send, and watch the conversation appear
 * on the phone with a price on every message. This is the client half of that.
 *
 * Uses EventSource rather than polling so a message shows up the instant the emulator
 * records it, which is what makes it feel like watching your app run.
 */

export type LiveStatus = 'off' | 'connecting' | 'connected' | 'error';

export interface LiveSnapshot {
  key: string | null;
  messages: SimMessage[];
}

export const DEFAULT_EMULATOR_URL = 'http://127.0.0.1:4290';

export interface LiveConnection {
  close: () => void;
}

/** The stream for one conversation, or for whichever is active when `key` is null. */
export function eventsUrl(url: string, key: string | null): string {
  const base = `${url.replace(/\/$/, '')}/_sim/events`;
  return key ? `${base}?key=${encodeURIComponent(key)}` : base;
}

/**
 * Opens the stream. `onSnapshot` fires with the full conversation on every change; the
 * emulator sends state rather than deltas, so a client that connects mid-run or drops a
 * frame is never out of sync.
 */
export function connectLive(
  url: string,
  handlers: {
    onSnapshot: (snapshot: LiveSnapshot) => void;
    onStatus: (status: LiveStatus) => void;
    /** Every conversation the emulator holds, sent with each frame. */
    onKeys?: (keys: string[]) => void;
  },
  key: string | null = null,
): LiveConnection {
  let source: EventSource | null = null;
  let closed = false;

  try {
    handlers.onStatus('connecting');
    source = new EventSource(eventsUrl(url, key));

    source.onopen = () => {
      if (!closed) handlers.onStatus('connected');
    };

    source.onmessage = (event) => {
      if (closed) return;
      try {
        const payload = JSON.parse(event.data) as { key?: string | null; messages?: SimMessage[]; keys?: string[] };
        if (Array.isArray(payload.keys)) handlers.onKeys?.(payload.keys);
        // A frame with only the list is news about another conversation, not this one.
        if (payload.messages === undefined) return;
        handlers.onSnapshot({ key: payload.key ?? null, messages: payload.messages });
        handlers.onStatus('connected');
      } catch {
        // A malformed frame is not worth tearing the connection down for.
      }
    };

    source.onerror = () => {
      if (closed) return;
      // EventSource reconnects on its own; surface the state without closing, so a
      // restarted emulator reattaches instead of forcing the user to click again.
      handlers.onStatus('error');
    };
  } catch {
    handlers.onStatus('error');
  }

  return {
    close: () => {
      closed = true;
      source?.close();
      handlers.onStatus('off');
    },
  };
}

export type InboundResult =
  | { ok: true }
  | { ok: false; reason: 'unreachable' }
  | { ok: false; reason: 'http'; status: number; message: string | null };

/**
 * Speaks as the customer of the conversation on screen.
 *
 * The emulator keys a conversation as `<phone_number_id>:<customer digits>`, the same key
 * the stream carries, so splitting it gives back the identity `/_sim/inbound` asks for and
 * the message lands in that conversation. Nothing is added to the screen here: the message
 * shows up when the emulator broadcasts it, like every other one.
 */
export async function sendInbound(
  url: string,
  key: string,
  text: string,
  fetchImpl: typeof fetch = fetch,
): Promise<InboundResult> {
  const cut = key.indexOf(':');
  const body = { phone_number_id: key.slice(0, cut), from: key.slice(cut + 1), text };
  let response: Response;
  try {
    response = await fetchImpl(`${url.replace(/\/$/, '')}/_sim/inbound`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, reason: 'unreachable' };
  }
  if (response.ok) return { ok: true };
  // The emulator answers a refusal with a Graph-shaped error that says why; keep it.
  let message: string | null = null;
  try {
    const payload = (await response.json()) as { error?: { message?: unknown } };
    message = typeof payload.error?.message === 'string' ? payload.error.message : null;
  } catch {
    // Not JSON: the status alone is all there is.
  }
  return { ok: false, reason: 'http', status: response.status, message };
}
