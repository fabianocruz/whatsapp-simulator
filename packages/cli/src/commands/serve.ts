import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { priceConversation } from '@dyvit/whatsapp-pricing';
import type { Currency, PricedConversation, SimMessage } from '@dyvit/whatsapp-pricing';
import {
  GraphApiError,
  fromGraphSendRequest,
  toGraphSendResponse,
  toInboundWebhook,
  toStatusWebhook,
  type GraphSendRequest,
} from '../adapters/graph-api';
import { WebhookDispatcher } from '../adapters/webhook-dispatcher';

export interface ServeOptions {
  port: number;
  host?: string;
  webhookUrl?: string;
  appSecret?: string;
  asOf?: string;
  market?: string;
  currency?: Currency;
  displayPhoneNumber?: string;
  /** Template category assumed when a send does not declare one. */
  defaultTemplateCategory?: string;
  /** Injected by tests so a run is deterministic. */
  now?: () => Date;
  log?: (line: string) => void;
}

interface SessionState {
  messages: SimMessage[];
}

/** One connected UI. */
interface Subscriber {
  response: ServerResponse;
  /** Conversation key this client is watching, or null for "whichever is active". */
  key: string | null;
}

const MAX_BODY_BYTES = 1_000_000;

async function readJsonBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk as Buffer);
    size += buffer.byteLength;
    if (size > MAX_BODY_BYTES) throw new GraphApiError('request body too large', 413, 100);
    chunks.push(buffer);
  }
  if (size === 0) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new GraphApiError('request body is not valid JSON', 400, 100);
  }
}

/**
 * The simulator UI runs on its own port, so every response carries CORS. This is a local
 * development tool serving the developer their own simulated messages; there is nothing
 * here that belongs to anyone else.
 */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
};

function json(response: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'content-type': 'application/json',
    'content-length': Buffer.byteLength(payload),
    ...CORS,
  });
  response.end(payload);
}

/**
 * A local stand-in for the Cloud API.
 *
 * A project points its Graph base URL at this server, keeps its payloads unchanged, and
 * gets back the same send response, the same status webhooks, and — on top of what Meta
 * gives you — the price decision for every message as it happens.
 *
 * It is a development tool: no auth, no persistence, single conversation per phone number
 * pair. It never sends a real message.
 */
export function createEmulatorServer(options: ServeOptions): Server {
  const sessions = new Map<string, SessionState>();
  const subscribers = new Set<Subscriber>();
  const dispatcher = new WebhookDispatcher({
    ...(options.webhookUrl ? { url: options.webhookUrl } : {}),
    ...(options.appSecret ? { appSecret: options.appSecret } : {}),
  });
  /**
   * The conversation clock.
   *
   * Real time is the wrong clock for this tool: a collections flow spans days, and an
   * application replaying it against the emulator finishes in seconds, so every message
   * lands in the same minute and the 24h window — the thing the whole product is about —
   * never closes. `POST /_sim/clock` moves it.
   *
   * It lives in the emulator rather than in a per-message field on purpose: the promise is
   * that you point your existing app at localhost without touching its payloads.
   */
  const wallClock = options.now ?? (() => new Date());
  let clockOffsetMs = 0;
  const now = () => new Date(wallClock().getTime() + clockOffsetMs);
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  const market = options.market ?? 'BR';
  const currency = options.currency ?? 'BRL';
  const displayPhoneNumber = options.displayPhoneNumber ?? '+55 11 90000-0000';

  function sessionFor(key: string): SessionState {
    let session = sessions.get(key);
    if (!session) {
      session = { messages: [] };
      sessions.set(key, session);
    }
    return session;
  }

  /**
   * Pushes the priced conversation to every connected UI.
   *
   * Sent after the message is already in `session.messages` and its status applied, so a
   * client never renders a message the server is still halfway through recording.
   */
  function broadcast(key: string): void {
    if (subscribers.size === 0) return;
    const session = sessions.get(key);
    if (!session) return;
    const payload = JSON.stringify({ key, messages: session.messages, priced: price(session) });
    for (const subscriber of subscribers) {
      if (subscriber.key !== null && subscriber.key !== key) continue;
      try {
        subscriber.response.write(`data: ${payload}\n\n`);
      } catch {
        // A client that went away is dropped on its own 'close' event; ignore the write.
      }
    }
  }

  function price(session: SessionState): PricedConversation {
    return priceConversation(session.messages, {
      asOf: options.asOf ?? now().toISOString().slice(0, 10),
      market,
      currency,
    });
  }

  async function handleSend(
    response: ServerResponse,
    phoneNumberId: string,
    body: GraphSendRequest,
  ): Promise<void> {
    const recipient = body.to ?? 'unknown';
    const session = sessionFor(`${phoneNumberId}:${recipient}`);
    const sentAt = now().toISOString();
    const id = `wamid.sim.${randomUUID()}`;

    const message = fromGraphSendRequest(body, {
      id,
      sentAt,
      ...(options.defaultTemplateCategory ? { defaultTemplateCategory: options.defaultTemplateCategory } : {}),
    });
    session.messages.push(message);

    // The real API accepts first and reports status later. The emulator instead walks the
    // message to `delivered` and dispatches both webhooks before answering the send: a
    // developer polling GET /_sim/state right after a send must never see a half-applied
    // message, and a deterministic tool is worth more here than faithful latency.
    const stored = session.messages[session.messages.length - 1]!;
    for (const status of ['sent', 'delivered'] as const) {
      // Delivery is what triggers a charge, so the status is applied before pricing.
      stored.status = status;
      const priced = status === 'delivered' ? price(session) : null;
      const decision = priced?.byMessageId[id];
      await dispatcher.dispatch(
        toStatusWebhook(id, {
          phoneNumberId,
          displayPhoneNumber,
          recipient,
          status,
          timestamp: now().toISOString(),
          ...(decision ? { pricing: { billable: decision.billable, category: decision.category } } : {}),
        }),
      );
      if (decision) {
        log(
          `[price] ${id} ${decision.category} ${decision.billable ? decision.amount.toFixed(4) : 'free'} ${currency} ` +
            `· ${decision.reasonCode} · total ${priced!.total.toFixed(4)}`,
        );
      }
    }

    broadcast(`${phoneNumberId}:${recipient}`);
    json(response, 200, toGraphSendResponse(message, recipient));
  }

  async function handleSimulateInbound(
    response: ServerResponse,
    body: Record<string, unknown>,
  ): Promise<void> {
    const phoneNumberId = String(body.phone_number_id ?? 'sim-phone-number');
    const from = String(body.from ?? '+5511999999999');
    const session = sessionFor(`${phoneNumberId}:${from}`);
    const message: SimMessage = {
      id: `wamid.sim.${randomUUID()}`,
      direction: 'user_to_business',
      kind: 'non_template',
      category: 'service',
      sentAt: String(body.sent_at ?? now().toISOString()),
      status: 'delivered',
      contentType: 'text',
      entryPoint: (body.entry_point as SimMessage['entryPoint']) ?? 'organic',
      bodyPreview: String(body.text ?? ''),
    };
    session.messages.push(message);

    const delivery = await dispatcher.dispatch(toInboundWebhook(message, { phoneNumberId, displayPhoneNumber, from }));
    broadcast(`${phoneNumberId}:${from}`);
    json(response, 200, { ok: true, message, webhook: delivery });
  }

  return createServer((request, response) => {
    void (async () => {
      try {
        const url = new URL(request.url ?? '/', `http://${request.headers.host ?? 'localhost'}`);
        const path = url.pathname;

        if (request.method === 'OPTIONS') {
          response.writeHead(204, CORS).end();
          return;
        }

        // GET /_sim/events — server-sent events, one message per conversation change.
        // SSE rather than a WebSocket because the traffic is one-way and this keeps the
        // emulator dependency-free.
        if (request.method === 'GET' && path === '/_sim/events') {
          const key = url.searchParams.get('key');
          response.writeHead(200, {
            'content-type': 'text/event-stream',
            'cache-control': 'no-cache',
            connection: 'keep-alive',
            ...CORS,
          });
          const subscriber: Subscriber = { response, key };
          subscribers.add(subscriber);
          request.on('close', () => subscribers.delete(subscriber));

          // Replay current state so a UI that connects mid-conversation is not blank.
          const existing = key ? sessions.get(key) : [...sessions.entries()][0]?.[1];
          const existingKey = key ?? [...sessions.keys()][0] ?? null;
          if (existing && existingKey) {
            response.write(
              `data: ${JSON.stringify({ key: existingKey, messages: existing.messages, priced: price(existing) })}\n\n`,
            );
          } else {
            response.write(`data: ${JSON.stringify({ key: null, messages: [], priced: null })}\n\n`);
          }
          // A comment every 25s keeps proxies and browsers from closing an idle stream.
          const ping = setInterval(() => response.write(': ping\n\n'), 25_000);
          request.on('close', () => clearInterval(ping));
          return;
        }

        if (request.method === 'GET' && path === '/health') {
          json(response, 200, { ok: true, conversations: sessions.size, watchers: subscribers.size });
          return;
        }

        // GET /_sim/state?key=<phoneNumberId>:<recipient> — the priced timeline so far.
        if (request.method === 'GET' && path === '/_sim/state') {
          const key = url.searchParams.get('key');
          const session = key ? sessions.get(key) : [...sessions.values()][0];
          if (!session) {
            json(response, 404, { error: 'no conversation yet', keys: [...sessions.keys()] });
            return;
          }
          json(response, 200, { messages: session.messages, priced: price(session) });
          return;
        }

        if (request.method === 'GET' && path === '/_sim/webhooks') {
          json(response, 200, { deliveries: dispatcher.deliveries });
          return;
        }

        // POST /_sim/clock — advance or pin the conversation clock.
        //   { "advance_hours": 26 }        moves it forward
        //   { "now": "2026-09-02T16:00Z" } pins it
        if (request.method === 'POST' && path === '/_sim/clock') {
          const body = (await readJsonBody(request)) as { advance_hours?: number; advance_minutes?: number; now?: string };
          if (typeof body.now === 'string') {
            const pinned = Date.parse(body.now);
            if (Number.isNaN(pinned)) throw new GraphApiError(`"now" is not a valid timestamp: ${body.now}`, 400);
            clockOffsetMs = pinned - wallClock().getTime();
          }
          const hours = Number(body.advance_hours ?? 0);
          const minutes = Number(body.advance_minutes ?? 0);
          if (!Number.isFinite(hours) || !Number.isFinite(minutes)) {
            throw new GraphApiError('advance_hours and advance_minutes must be numbers', 400);
          }
          clockOffsetMs += hours * 3_600_000 + minutes * 60_000;
          json(response, 200, { now: now().toISOString(), offsetMinutes: Math.round(clockOffsetMs / 60_000) });
          return;
        }

        if (request.method === 'POST' && path === '/_sim/inbound') {
          await handleSimulateInbound(response, (await readJsonBody(request)) as Record<string, unknown>);
          return;
        }

        // POST /v{version}/{phone-number-id}/messages — the Cloud API send endpoint.
        const send = /^\/v\d+\.\d+\/([^/]+)\/messages$/.exec(path);
        if (request.method === 'POST' && send) {
          await handleSend(response, send[1]!, (await readJsonBody(request)) as GraphSendRequest);
          return;
        }

        json(response, 404, {
          error: {
            message: `unsupported route ${request.method} ${path}. The emulator serves POST /v22.0/{phone-number-id}/messages, POST /_sim/inbound, GET /_sim/state, GET /_sim/webhooks and GET /health.`,
            type: 'GraphMethodException',
            code: 100,
          },
        });
      } catch (error) {
        if (error instanceof GraphApiError) {
          json(response, error.status, error.toResponseBody());
          return;
        }
        json(response, 500, { error: { message: error instanceof Error ? error.message : String(error), code: 1 } });
      }
    })();
  });
}

export async function runServe(options: ServeOptions): Promise<number> {
  const server = createEmulatorServer(options);
  const host = options.host ?? '127.0.0.1';
  await new Promise<void>((resolve) => server.listen(options.port, host, resolve));

  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));
  log(`dyvit-wa-sim emulator on http://${host}:${options.port}`);
  log(`  Graph base URL:  http://${host}:${options.port}/v22.0`);
  log(`  webhooks:        ${options.webhookUrl ?? '(not configured; inspect GET /_sim/webhooks)'}`);
  log(`  priced state:    GET http://${host}:${options.port}/_sim/state`);
  log(`  live stream:     GET http://${host}:${options.port}/_sim/events`);
  log(`  conversation clock: POST http://${host}:${options.port}/_sim/clock  {"advance_hours": 26}`);
  log('  no real messages are sent; the official bill is Meta’s.');

  // Resolve only on shutdown so the CLI process stays alive while serving.
  await new Promise<void>((resolve) => {
    const stop = () => server.close(() => resolve());
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  return 0;
}
