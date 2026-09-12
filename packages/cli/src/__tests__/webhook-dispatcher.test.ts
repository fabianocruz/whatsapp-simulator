import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { WebhookDispatcher } from '../adapters/webhook-dispatcher';

describe('WebhookDispatcher', () => {
  it('records what it would have sent when no URL is configured', async () => {
    const dispatcher = new WebhookDispatcher();
    const delivery = await dispatcher.dispatch({ hello: 'world' });
    expect(delivery.status).toBeNull();
    expect(dispatcher.deliveries).toHaveLength(1);
    expect(dispatcher.deliveries[0]!.body).toEqual({ hello: 'world' });
  });

  it('signs the body the way Meta signs it', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const dispatcher = new WebhookDispatcher({
      url: 'https://example.test/hook',
      appSecret: 's3cret',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await dispatcher.dispatch({ a: 1 });

    const [, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    const rawBody = init.body as string;
    const expected = `sha256=${createHmac('sha256', 's3cret').update(rawBody, 'utf8').digest('hex')}`;
    expect((init.headers as Record<string, string>)['x-hub-signature-256']).toBe(expected);
    // Signature must cover the exact bytes sent, not a re-serialization.
    expect(rawBody).toBe(JSON.stringify({ a: 1 }));
  });

  it('omits the signature header when no app secret is configured', async () => {
    const fetchImpl = vi.fn(async () => new Response('ok', { status: 200 }));
    const dispatcher = new WebhookDispatcher({
      url: 'https://example.test/hook',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });
    await dispatcher.dispatch({ a: 1 });
    const [, init] = fetchImpl.mock.calls[0]! as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)['x-hub-signature-256']).toBeUndefined();
  });

  it('records a failed delivery instead of throwing', async () => {
    const dispatcher = new WebhookDispatcher({
      url: 'https://example.test/hook',
      fetchImpl: (async () => {
        throw new Error('ECONNREFUSED');
      }) as unknown as typeof fetch,
    });
    const delivery = await dispatcher.dispatch({ a: 1 });
    expect(delivery.error).toBe('ECONNREFUSED');
    expect(delivery.status).toBeNull();
  });
});
