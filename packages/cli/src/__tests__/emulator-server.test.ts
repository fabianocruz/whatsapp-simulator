import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createEmulatorServer } from '../commands/serve';

/**
 * The spec's release gate, exercised end to end: a project points its Graph base URL at
 * localhost, sends a supported scenario, and reconciles every event against a
 * deterministic price decision trace.
 */

let server: Server | null = null;

async function start(options: Parameters<typeof createEmulatorServer>[0]): Promise<string> {
  server = createEmulatorServer(options);
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as AddressInfo;
  return `http://127.0.0.1:${port}`;
}

afterEach(async () => {
  if (server) await new Promise<void>((resolve) => server!.close(() => resolve()));
  server = null;
});

/** A clock the test drives by hand, so the run is deterministic. */
function clock(startIso: string) {
  let current = Date.parse(startIso);
  return {
    now: () => new Date(current),
    advanceHours(hours: number) {
      current += hours * 3_600_000;
    },
  };
}

const PHONE_NUMBER_ID = '109876543210';
const RECIPIENT = '+5511999999999';

const post = (base: string, path: string, body: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('local Cloud API emulator', () => {
  it('replays the spec worked example through the wire and reconciles the trace', async () => {
    const time = clock('2026-09-01T10:00:00.000Z');
    const base = await start({ port: 0, asOf: '2026-09-01', now: time.now, log: () => {} });

    // 0h — marketing template, out of any window.
    const send = await post(base, `/v22.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: RECIPIENT,
      type: 'template',
      template: { name: 'promo_setembro', language: { code: 'pt_BR' }, category: 'marketing' },
    });
    expect(send.status).toBe(200);
    const sendBody = (await send.json()) as any;
    expect(sendBody.messaging_product).toBe('whatsapp');
    expect(sendBody.messages[0].id).toMatch(/^wamid\.sim\./);

    // 2h — the customer replies, opening the 24h window.
    time.advanceHours(2);
    const inbound = await post(base, '/_sim/inbound', {
      phone_number_id: PHONE_NUMBER_ID,
      from: RECIPIENT,
      text: 'Esse desconto vale para o plano anual?',
      sent_at: time.now().toISOString(),
    });
    expect(inbound.status).toBe(200);

    // 3h — free-text reply inside the window.
    time.advanceHours(1);
    await post(base, `/v22.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: RECIPIENT,
      type: 'text',
      text: { body: 'Vale sim, para o plano anual e para o mensal.' },
    });

    // 4h — utility template, still inside the window.
    time.advanceHours(1);
    await post(base, `/v22.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: RECIPIENT,
      type: 'template',
      template: { name: 'confirmacao_pedido', category: 'utility' },
    });

    // 30h — utility template after the window closed.
    time.advanceHours(26);
    await post(base, `/v22.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: RECIPIENT,
      type: 'template',
      template: { name: 'status_pedido', category: 'utility' },
    });

    const state = await fetch(`${base}/_sim/state?key=${PHONE_NUMBER_ID}:${encodeURIComponent(RECIPIENT)}`);
    expect(state.status).toBe(200);
    const { priced } = (await state.json()) as any;

    // The same R$ 0,3567 the offline golden test pins, reached over HTTP.
    expect(priced.totalMicros).toBe(356_700);
    expect(priced.decisions.map((d: any) => d.reasonCode)).toEqual([
      'BILLABLE_MARKETING_TEMPLATE',
      'FREE_INBOUND',
      'FREE_SERVICE',
      'FREE_IN_CSW',
      'BILLABLE_UTILITY_TEMPLATE',
    ]);
  });

  it('emits sent and delivered webhooks, pricing only the delivered one', async () => {
    const time = clock('2026-09-01T10:00:00.000Z');
    const base = await start({ port: 0, asOf: '2026-09-01', now: time.now, log: () => {} });

    await post(base, `/v22.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: RECIPIENT,
      type: 'template',
      template: { name: 'promo', category: 'marketing' },
    });

    const { deliveries } = (await (await fetch(`${base}/_sim/webhooks`)).json()) as any;
    const statuses = deliveries.map((d: any) => d.body.entry[0].changes[0].value.statuses[0]);
    expect(statuses.map((s: any) => s.status)).toEqual(['sent', 'delivered']);
    expect(statuses[0].pricing).toBeUndefined();
    expect(statuses[1].pricing).toEqual({
      billable: true,
      pricing_model: 'PMP',
      type: 'regular',
      category: 'marketing',
    });
  });

  it('opens a free entry point when the inbound message came from an ad', async () => {
    const time = clock('2026-09-01T10:00:00.000Z');
    const base = await start({ port: 0, asOf: '2026-09-01', now: time.now, log: () => {} });

    await post(base, '/_sim/inbound', {
      phone_number_id: PHONE_NUMBER_ID,
      from: RECIPIENT,
      text: 'Vi o anuncio',
      entry_point: 'click_to_whatsapp_ad',
      sent_at: time.now().toISOString(),
    });

    time.advanceHours(1);
    await post(base, `/v22.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: RECIPIENT,
      type: 'template',
      template: { name: 'promo', category: 'marketing' },
    });

    const { priced } = (await (
      await fetch(`${base}/_sim/state?key=${PHONE_NUMBER_ID}:${encodeURIComponent(RECIPIENT)}`)
    ).json()) as any;
    expect(priced.totalMicros).toBe(0);
    expect(priced.decisions[1].reasonCode).toBe('FREE_IN_FEP');
  });

  it('returns a Graph-shaped error for a template category it cannot price', async () => {
    const base = await start({ port: 0, asOf: '2026-09-01', log: () => {} });
    const response = await post(base, `/v22.0/${PHONE_NUMBER_ID}/messages`, {
      messaging_product: 'whatsapp',
      to: RECIPIENT,
      type: 'template',
      template: { name: 'promo', category: 'promotional' },
    });
    expect(response.status).toBe(400);
    const body = (await response.json()) as any;
    expect(body.error.code).toBe(132_000);
    expect(body.error.message).toContain('template category');
  });

  it('rejects malformed JSON without falling over', async () => {
    const base = await start({ port: 0, asOf: '2026-09-01', log: () => {} });
    const response = await fetch(`${base}/v22.0/${PHONE_NUMBER_ID}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{ not json',
    });
    expect(response.status).toBe(400);
    expect(((await response.json()) as any).error.message).toContain('valid JSON');
  });

  it('answers /health and explains unsupported routes', async () => {
    const base = await start({ port: 0, asOf: '2026-09-01', log: () => {} });
    expect(((await (await fetch(`${base}/health`)).json()) as any).ok).toBe(true);

    const missing = await fetch(`${base}/v22.0/${PHONE_NUMBER_ID}/media`);
    expect(missing.status).toBe(404);
    expect(((await missing.json()) as any).error.message).toContain('POST /v22.0/{phone-number-id}/messages');
  });

  it('keeps conversations separate per phone number and recipient', async () => {
    const time = clock('2026-09-01T10:00:00.000Z');
    const base = await start({ port: 0, asOf: '2026-09-01', now: time.now, log: () => {} });

    for (const to of ['+5511111111111', '+5522222222222']) {
      await post(base, `/v22.0/${PHONE_NUMBER_ID}/messages`, {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: { name: 'promo', category: 'marketing' },
      });
    }

    const first = (await (
      await fetch(`${base}/_sim/state?key=${PHONE_NUMBER_ID}:${encodeURIComponent('+5511111111111')}`)
    ).json()) as any;
    expect(first.messages).toHaveLength(1);
    expect(first.priced.totalMicros).toBe(321_700);
  });
});

/**
 * A busy port is how this command usually fails, and Node's default for it is an
 * unhandled 'error' event: a stack trace through net.js that says nothing a developer can
 * act on. These pin the friendly path, because the failure mode is guaranteed to recur.
 */
describe('runServe on a port that is taken', () => {
  it('explains the conflict instead of throwing a stack trace', async () => {
    const { runServe } = await import('../commands/serve.js');

    const blocker = createEmulatorServer({ port: 0, log: () => {} });
    await new Promise<void>((resolve) => blocker.listen(0, '127.0.0.1', resolve));
    const { port } = blocker.address() as AddressInfo;

    let stderr = '';
    const spy = vi.spyOn(process.stderr, 'write').mockImplementation((chunk) => {
      stderr += String(chunk);
      return true;
    });

    try {
      const code = await runServe({ port, host: '127.0.0.1', log: () => {} });
      expect(code).toBe(1);
      expect(stderr).toContain(`porta ${port}`);
      // It has to hand over the two things that actually unblock someone.
      expect(stderr).toContain('lsof');
      expect(stderr).toContain(`--port ${port + 1}`);
      expect(stderr).not.toContain('at Server.setupListenHandle');
    } finally {
      spy.mockRestore();
      await new Promise<void>((resolve) => blocker.close(() => resolve()));
    }
  });
});
