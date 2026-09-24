import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { randomUUID } from 'node:crypto';
import { deriveWindows, priceConversation, selectRuleSet } from '@dyvit/whatsapp-pricing';
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

  /**
   * Refuses a send Meta would refuse, with Meta's error.
   *
   * Outside the customer service window only an approved template may go out, and that is
   * the rule a collections agent runs into the moment the payment lands three days after
   * the conversation: it cannot say "recebemos" in free text. An emulator that answers 200
   * there lets an app pass here and fail against Meta, which is the one thing this tool
   * exists to prevent.
   *
   * The decision is the engine's, not a second opinion: `deriveWindows` is what R6 and R7
   * read when they price the same message. Reading it one step earlier is the difference
   * between explaining the refusal after the fact and making it.
   */
  function refuseOutsideWindow(prior: readonly SimMessage[], message: SimMessage, sentAt: string): void {
    if (message.kind !== 'non_template') return;
    const ruleSet = selectRuleSet(options.asOf ?? now().toISOString().slice(0, 10));
    const window = deriveWindows(prior, ruleSet).stateAt(sentAt);
    // R7 first: inside a free entry point window the send is allowed and free, CSW or no CSW.
    if (window.fepActive || window.cswOpen) return;
    throw new GraphApiError(
      '(#131047) Message failed to send because more than 24 hours have passed since the customer ' +
        'last replied to this message',
      400,
      131_047,
      window.cswOpenUntil
        ? `the ${ruleSet.cswHours}h customer service window closed at ${window.cswOpenUntil}; ` +
          'only an approved template may be sent now'
        : 'the customer has never messaged this number, so no customer service window is open; ' +
          'only an approved template may be sent now',
    );
  }

  async function handleSend(
    response: ServerResponse,
    phoneNumberId: string,
    body: GraphSendRequest,
  ): Promise<void> {
    const recipient = body.to ?? 'unknown';
    const key = `${phoneNumberId}:${recipient}`;
    const sentAt = now().toISOString();
    const id = `wamid.sim.${randomUUID()}`;

    const message = fromGraphSendRequest(body, {
      id,
      sentAt,
      ...(options.defaultTemplateCategory ? { defaultTemplateCategory: options.defaultTemplateCategory } : {}),
    });
    // Against the conversation as it stands: a refused send leaves no trace, the way a
    // message Meta never accepted leaves none. The session is only created once the send
    // is going to happen.
    refuseOutsideWindow(sessions.get(key)?.messages ?? [], message, sentAt);
    const session = sessionFor(key);
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

  /** The routes this server answers, in one place so `/` and the 404 cannot disagree. */
  const ROUTES: Array<[string, string]> = [
    ['POST /v22.0/{phone-number-id}/messages', 'Envio, no mesmo shape da Cloud API'],
    ['POST /_sim/inbound', 'Simula uma mensagem do cliente (aceita entry_point)'],
    ['POST /_sim/clock', 'Move o relógio da conversa: {"advance_hours": 26}'],
    ['GET /_sim/state', 'Timeline precificada até agora'],
    ['GET /_sim/events', 'Stream SSE da conversa, usado pelo modo Ao vivo'],
    ['GET /_sim/webhooks', 'Webhooks que foram, ou seriam, entregues'],
    ['GET /health', 'Status do emulador'],
  ];

  /**
   * Opening the base URL in a browser is the first thing anyone does after starting a
   * server. Answering that with a Graph-shaped 404 is technically consistent and
   * practically useless, so `/` explains what this is, what it answers, and where the
   * phone frame lives — which is a different process on a different port, and the single
   * most likely thing someone is looking for when they land here.
   */
  function indexPage(): string {
    const rows = ROUTES.map(
      ([route, what]) =>
        `<tr><td><code>${route}</code></td><td>${what}</td></tr>`,
    ).join('');
    return `<!doctype html><meta charset="utf-8"><title>dyvit-wa-sim</title>
<style>
 :root{color-scheme:dark}
 body{background:#0B141A;color:#e9edef;font:15px/1.6 ui-sans-serif,system-ui,sans-serif;margin:0;padding:48px 24px}
 main{max-width:760px;margin:0 auto}
 h1{font-size:22px;margin:0 0 4px;letter-spacing:-.02em}
 p{color:#8696a0;margin:0 0 24px}
 table{width:100%;border-collapse:collapse;margin:0 0 28px}
 td{padding:9px 0;border-top:1px solid rgba(255,255,255,.08);vertical-align:top}
 td:first-child{width:52%;padding-right:16px}
 code{font:13px ui-monospace,SFMono-Regular,monospace;color:#8FE3C0}
 .box{border:1px solid rgba(143,227,192,.25);background:rgba(10,110,74,.14);border-radius:10px;padding:14px 16px;margin:0 0 24px}
 .box b{color:#8FE3C0;font-weight:600}
 small{color:#667781;display:block;margin-top:28px;font-size:13px}
</style>
<main>
 <h1>dyvit-wa-sim</h1>
 <p>Emulador local da WhatsApp Cloud API, com preço por mensagem.</p>
 <div class="box">
  <b>Aponte seu app para</b> <code>http://${options.host ?? '127.0.0.1'}:${options.port}/v22.0</code><br>
  no lugar de <code>https://graph.facebook.com/v22.0</code>. O resto do seu código não muda.
 </div>
 <div class="box">
  <b>Para ver a conversa no telefone</b>, rode <code>pnpm dev:web</code> e abra
  <code>http://localhost:3000</code>. Lá, ligue <b>Ao vivo</b> apontando para este emulador.
  O simulador é outro processo, noutra porta.
 </div>
 <table>${rows}</table>
 <small>Nenhuma mensagem real é enviada. A cobrança oficial é a da Meta.</small>
</main>`;
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

        // GET / — a página que explica o emulador, para quem abriu a URL no navegador.
        if (request.method === 'GET' && (path === '/' || path === '/index.html')) {
          if ((request.headers.accept ?? '').includes('text/html')) {
            const html = indexPage();
            response.writeHead(200, {
              'content-type': 'text/html; charset=utf-8',
              'content-length': Buffer.byteLength(html),
              ...CORS,
            });
            response.end(html);
            return;
          }
          json(response, 200, { name: 'dyvit-wa-sim', routes: Object.fromEntries(ROUTES) });
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
            message:
              `unsupported route ${request.method} ${path}. ` +
              `The emulator serves: ${ROUTES.map(([route]) => route).join(', ')}. ` +
              `Open / in a browser for the full reference.`,
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
  const log = options.log ?? ((line: string) => process.stdout.write(`${line}\n`));

  /**
   * A busy port is the most common way this command fails, and the least interesting.
   * Node's default is an unhandled 'error' event and a stack trace through net.js, which
   * tells a developer nothing they can act on. Say what happened and what to do instead.
   */
  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(options.port, host, () => {
        server.removeListener('error', reject);
        resolve();
      });
    });
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'EADDRINUSE') {
      process.stderr.write(
        `dyvit-wa-sim: a porta ${options.port} já está em uso em ${host}.\n\n` +
          `  Provavelmente é um emulador que ficou rodando de antes. Para ver quem está lá:\n` +
          `    lsof -nP -iTCP:${options.port} -sTCP:LISTEN\n\n` +
          `  Encerre aquele processo, ou suba em outra porta:\n` +
          `    dyvit-wa-sim serve --port ${options.port + 1}\n`,
      );
      return 1;
    }
    if (code === 'EACCES') {
      process.stderr.write(
        `dyvit-wa-sim: sem permissão para escutar na porta ${options.port}.\n` +
          `  Portas abaixo de 1024 exigem privilégio. Use uma porta alta, como --port 4290.\n`,
      );
      return 1;
    }
    throw error;
  }

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
