import { createHmac } from 'node:crypto';

export interface WebhookDelivery {
  url: string;
  status: number | null;
  error: string | null;
  body: unknown;
}

export interface WebhookDispatcherOptions {
  /** Destination URL; when absent the dispatcher records deliveries without sending. */
  url?: string;
  /** App secret used to sign the payload the way Meta does. */
  appSecret?: string;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

/**
 * Posts webhook payloads to the developer's own endpoint, signed the way Meta signs them.
 *
 * Deliveries are recorded whether or not a URL is configured, so a developer can inspect
 * what would have been sent before wiring up a tunnel.
 */
export class WebhookDispatcher {
  private readonly options: WebhookDispatcherOptions;
  private readonly log: WebhookDelivery[] = [];

  constructor(options: WebhookDispatcherOptions = {}) {
    this.options = options;
  }

  get deliveries(): readonly WebhookDelivery[] {
    return this.log;
  }

  /** `X-Hub-Signature-256`, as Meta computes it: sha256 HMAC of the raw JSON body. */
  sign(rawBody: string): string | null {
    if (!this.options.appSecret) return null;
    return `sha256=${createHmac('sha256', this.options.appSecret).update(rawBody, 'utf8').digest('hex')}`;
  }

  async dispatch(payload: unknown): Promise<WebhookDelivery> {
    const url = this.options.url;
    if (!url) {
      const delivery: WebhookDelivery = { url: '(not configured)', status: null, error: null, body: payload };
      this.log.push(delivery);
      return delivery;
    }

    const rawBody = JSON.stringify(payload);
    const signature = this.sign(rawBody);
    const send = this.options.fetchImpl ?? fetch;

    // A developer's endpoint being down is a normal thing to see in a simulator, so a
    // failed delivery is recorded and reported rather than thrown up the call stack.
    try {
      const response = await send(url, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          ...(signature ? { 'x-hub-signature-256': signature } : {}),
        },
        body: rawBody,
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 5_000),
      });
      const delivery: WebhookDelivery = { url, status: response.status, error: null, body: payload };
      this.log.push(delivery);
      return delivery;
    } catch (error) {
      const delivery: WebhookDelivery = {
        url,
        status: null,
        error: error instanceof Error ? error.message : String(error),
        body: payload,
      };
      this.log.push(delivery);
      return delivery;
    }
  }
}
