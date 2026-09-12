import type { ContentType, SimMessage } from '@dyvit/whatsapp-pricing';

/**
 * Translates Cloud API wire shapes into the simulator's SimMessage, and back into the
 * webhook shapes Meta emits.
 *
 * This adapter is the whole point of the local server: a project switches its Graph base
 * URL to localhost, keeps its payloads exactly as they are, and gets back a priced
 * timeline it can reconcile against. Only the fields that affect pricing or rendering
 * are read; anything else is carried along untouched.
 */

export interface GraphSendRequest {
  messaging_product?: string;
  to?: string;
  type?: string;
  template?: {
    name?: string;
    language?: { code?: string };
    /** Meta does not echo the category on send; the emulator accepts it as a hint. */
    category?: string;
  };
  text?: { body?: string };
  image?: { link?: string; caption?: string };
  audio?: { link?: string };
  video?: { link?: string; caption?: string };
  document?: { link?: string; filename?: string };
  sticker?: { link?: string };
  location?: { name?: string; address?: string };
  interactive?: { type?: string; body?: { text?: string } };
  [key: string]: unknown;
}

export class GraphApiError extends Error {
  readonly status: number;
  readonly code: number;

  constructor(message: string, status = 400, code = 100) {
    super(message);
    this.name = 'GraphApiError';
    this.status = status;
    this.code = code;
  }

  toResponseBody(): unknown {
    return {
      error: {
        message: this.message,
        type: 'OAuthException',
        code: this.code,
        fbtrace_id: 'dyvit-wa-sim',
      },
    };
  }
}

const CONTENT_TYPE_BY_GRAPH_TYPE: Record<string, ContentType> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  sticker: 'sticker',
  location: 'location',
  template: 'text',
};

const TEMPLATE_CATEGORIES = new Set(['marketing', 'utility', 'authentication']);

function interactiveContentType(type: string | undefined): ContentType {
  switch (type) {
    case 'list':
      return 'interactive_list';
    case 'cta_url':
      return 'cta_url';
    case 'flow':
      return 'flow';
    default:
      return 'interactive_buttons';
  }
}

function bodyPreviewOf(request: GraphSendRequest): string | undefined {
  return (
    request.text?.body ??
    request.interactive?.body?.text ??
    request.image?.caption ??
    request.video?.caption ??
    request.document?.filename ??
    request.template?.name
  );
}

/**
 * Builds a SimMessage from a `POST /{phone-number-id}/messages` payload.
 *
 * `sentAt` is supplied by the caller rather than read from the clock so a replayed
 * scenario prices identically every time.
 */
export function fromGraphSendRequest(
  request: GraphSendRequest,
  options: { id: string; sentAt: string; defaultTemplateCategory?: string },
): SimMessage {
  if (request.messaging_product !== undefined && request.messaging_product !== 'whatsapp') {
    throw new GraphApiError(`unsupported messaging_product "${request.messaging_product}"`, 400, 100);
  }
  const type = request.type ?? 'text';

  if (type === 'template') {
    const category = (request.template?.category ?? options.defaultTemplateCategory ?? 'utility').toLowerCase();
    if (!TEMPLATE_CATEGORIES.has(category)) {
      throw new GraphApiError(
        `unknown template category "${category}"; the emulator needs marketing, utility or authentication ` +
          'to price the send (pass it as template.category, which the real API ignores)',
        400,
        132_000,
      );
    }
    return {
      id: options.id,
      direction: 'business_to_user',
      kind: 'template',
      category: category as SimMessage['category'],
      sentAt: options.sentAt,
      status: 'sent',
      contentType: 'text',
      ...(request.template?.name ? { templateName: request.template.name } : {}),
      ...(bodyPreviewOf(request) ? { bodyPreview: bodyPreviewOf(request) } : {}),
    };
  }

  const contentType =
    type === 'interactive'
      ? interactiveContentType(request.interactive?.type)
      : CONTENT_TYPE_BY_GRAPH_TYPE[type];
  if (!contentType) {
    throw new GraphApiError(`unsupported message type "${type}"`, 400, 100);
  }

  return {
    id: options.id,
    direction: 'business_to_user',
    kind: 'non_template',
    category: 'service',
    sentAt: options.sentAt,
    status: 'sent',
    contentType,
    ...(bodyPreviewOf(request) ? { bodyPreview: bodyPreviewOf(request) } : {}),
  };
}

/** The `POST /messages` response body, matching the Cloud API shape. */
export function toGraphSendResponse(message: SimMessage, recipient: string): unknown {
  return {
    messaging_product: 'whatsapp',
    contacts: [{ input: recipient, wa_id: recipient.replace(/\D/g, '') }],
    messages: [{ id: message.id, message_status: 'accepted' }],
  };
}

export interface StatusWebhookOptions {
  phoneNumberId: string;
  displayPhoneNumber: string;
  recipient: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  /** Pricing fields, when the simulator has priced the message. */
  pricing?: {
    billable: boolean;
    category: string;
  };
}

/**
 * Builds the `messages` status webhook Meta sends.
 *
 * The `pricing` block mirrors the real one: `billable`, `pricing_model: "PMP"` and a
 * `type` of `regular` or `free_customer_service`, which is exactly what a project needs
 * in order to reconcile its own billing expectations against the emulator.
 */
export function toStatusWebhook(messageId: string, options: StatusWebhookOptions): unknown {
  const status: Record<string, unknown> = {
    id: messageId,
    status: options.status,
    timestamp: String(Math.floor(Date.parse(options.timestamp) / 1000)),
    recipient_id: options.recipient.replace(/\D/g, ''),
  };

  if (options.pricing && options.status === 'delivered') {
    status.pricing = {
      billable: options.pricing.billable,
      pricing_model: 'PMP',
      type: options.pricing.billable ? 'regular' : 'free_customer_service',
      category: options.pricing.category,
    };
  }

  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: options.phoneNumberId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: options.displayPhoneNumber,
                phone_number_id: options.phoneNumberId,
              },
              statuses: [status],
            },
          },
        ],
      },
    ],
  };
}

/** Builds the inbound-message webhook, for simulating a customer reply. */
export function toInboundWebhook(
  message: SimMessage,
  options: { phoneNumberId: string; displayPhoneNumber: string; from: string },
): unknown {
  return {
    object: 'whatsapp_business_account',
    entry: [
      {
        id: options.phoneNumberId,
        changes: [
          {
            field: 'messages',
            value: {
              messaging_product: 'whatsapp',
              metadata: {
                display_phone_number: options.displayPhoneNumber,
                phone_number_id: options.phoneNumberId,
              },
              contacts: [{ profile: { name: 'Simulated customer' }, wa_id: options.from.replace(/\D/g, '') }],
              messages: [
                {
                  from: options.from.replace(/\D/g, ''),
                  id: message.id,
                  timestamp: String(Math.floor(Date.parse(message.sentAt) / 1000)),
                  type: message.contentType === 'text' ? 'text' : (message.contentType ?? 'text'),
                  text: { body: message.bodyPreview ?? '' },
                  ...(message.entryPoint && message.entryPoint !== 'organic'
                    ? { referral: { source_type: message.entryPoint === 'click_to_whatsapp_ad' ? 'ad' : 'post' } }
                    : {}),
                },
              ],
            },
          },
        ],
      },
    ],
  };
}
