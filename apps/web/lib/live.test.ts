import { describe, expect, it, vi } from 'vitest';
import { sendInbound } from './live';

function respondWith(status: number) {
  return vi.fn(async () => new Response('{}', { status })) as unknown as typeof fetch & ReturnType<typeof vi.fn>;
}

describe('sendInbound', () => {
  it('posts as the customer of the conversation the key names', async () => {
    const fetchImpl = respondWith(200);
    const result = await sendInbound('http://127.0.0.1:4290/', '109876543210:5511999999999', 'Oi', fetchImpl);

    expect(result).toEqual({ ok: true });
    expect(fetchImpl).toHaveBeenCalledWith('http://127.0.0.1:4290/_sim/inbound', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ phone_number_id: '109876543210', from: '5511999999999', text: 'Oi' }),
    });
  });

  it('says the emulator did not answer when the request never lands', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('Failed to fetch');
    }) as unknown as typeof fetch;
    expect(await sendInbound('http://127.0.0.1:4290', '1:55', 'Oi', fetchImpl)).toEqual({
      ok: false,
      reason: 'unreachable',
    });
  });

  it('carries the status and the reason when the emulator refuses', async () => {
    const fetchImpl = vi.fn(
      async () => new Response(JSON.stringify({ error: { message: 'no conversation yet' } }), { status: 400 }),
    ) as unknown as typeof fetch;
    expect(await sendInbound('http://127.0.0.1:4290', '1:55', 'Oi', fetchImpl)).toEqual({
      ok: false,
      reason: 'http',
      status: 400,
      message: 'no conversation yet',
    });
  });

  it('falls back to the status alone when the refusal is not JSON', async () => {
    const fetchImpl = vi.fn(async () => new Response('Bad Gateway', { status: 502 })) as unknown as typeof fetch;
    expect(await sendInbound('http://127.0.0.1:4290', '1:55', 'Oi', fetchImpl)).toEqual({
      ok: false,
      reason: 'http',
      status: 502,
      message: null,
    });
  });
});
