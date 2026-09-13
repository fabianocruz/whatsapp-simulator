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
  },
): LiveConnection {
  let source: EventSource | null = null;
  let closed = false;

  try {
    handlers.onStatus('connecting');
    source = new EventSource(`${url.replace(/\/$/, '')}/_sim/events`);

    source.onopen = () => {
      if (!closed) handlers.onStatus('connected');
    };

    source.onmessage = (event) => {
      if (closed) return;
      try {
        const payload = JSON.parse(event.data) as { key: string | null; messages: SimMessage[] };
        handlers.onSnapshot({ key: payload.key, messages: payload.messages ?? [] });
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
