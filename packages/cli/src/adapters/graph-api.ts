import type {
  ContentType,
  MessageButton,
  MessageContent,
  MessageHeader,
  ListSection,
  SimMessage,
} from '@dyvit/whatsapp-pricing';

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
    components?: Array<{
      type?: string;
      sub_type?: string;
      index?: string;
      parameters?: Array<{
        type?: string;
        text?: string;
        document?: { filename?: string };
        payload?: string;
      }>;
    }>;
  };
  text?: { body?: string };
  image?: { link?: string; caption?: string };
  audio?: { link?: string };
  video?: { link?: string; caption?: string };
  document?: { link?: string; filename?: string };
  sticker?: { link?: string };
  location?: { name?: string; address?: string };
  interactive?: {
    type?: string;
    header?: { type?: string; text?: string; document?: { filename?: string } };
    body?: { text?: string };
    footer?: { text?: string };
    action?: {
      buttons?: Array<{ type?: string; reply?: { id?: string; title?: string } }>;
      button?: string;
      sections?: Array<{ title?: string; rows?: Array<{ id?: string; title?: string; description?: string }> }>;
      name?: string;
      parameters?: { flow_cta?: string; flow_name?: string };
    };
  };
  [key: string]: unknown;
}

export class GraphApiError extends Error {
  readonly status: number;
  readonly code: number;
  /** `error_data.details`, which is where Meta puts the sentence a developer can act on. */
  readonly details: string | undefined;

  constructor(message: string, status = 400, code = 100, details?: string) {
    super(message);
    this.name = 'GraphApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  toResponseBody(): unknown {
    return {
      error: {
        message: this.message,
        type: 'OAuthException',
        code: this.code,
        ...(this.details ? { error_data: { messaging_product: 'whatsapp', details: this.details } } : {}),
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

/**
 * Builds the structured content the phone frame renders.
 *
 * The Cloud API expresses a template's header, body, footer and buttons as a flat
 * `components` array where position carries meaning, so this is where that shape gets
 * turned into something a renderer can walk. Anything unrecognized degrades to text
 * rather than throwing: a simulator that refuses a payload it half-understands is worse
 * than one that shows the body.
 */
function contentOf(request: GraphSendRequest, type: string): MessageContent | undefined {
  if (type === 'text') {
    return request.text?.body ? { kind: 'text', body: request.text.body } : undefined;
  }

  if (['image', 'video', 'audio', 'document', 'sticker'].includes(type)) {
    const media = type as 'image' | 'video' | 'audio' | 'document' | 'sticker';
    const caption = request.image?.caption ?? request.video?.caption;
    return {
      kind: 'media',
      media,
      ...(caption ? { caption } : {}),
      ...(request.document?.filename ? { filename: request.document.filename } : {}),
    };
  }

  if (type === 'location') {
    return {
      kind: 'location',
      ...(request.location?.name ? { name: request.location.name } : {}),
      ...(request.location?.address ? { address: request.location.address } : {}),
    };
  }

  if (type === 'template') {
    const components = request.template?.components ?? [];
    const part = (kind: string) => components.find((c) => c.type?.toLowerCase() === kind);

    const headerComponent = part('header');
    const headerParam = headerComponent?.parameters?.[0];
    let header: MessageHeader | undefined;
    if (headerParam) {
      const paramType = (headerParam.type ?? 'text').toLowerCase();
      header =
        paramType === 'text'
          ? { type: 'text', ...(headerParam.text ? { text: headerParam.text } : {}) }
          : {
              type: (paramType === 'image' || paramType === 'video' ? paramType : 'document') as MessageHeader['type'],
              ...(headerParam.document?.filename ? { filename: headerParam.document.filename } : {}),
            };
    }

    const buttons: MessageButton[] = components
      .filter((c) => c.type?.toLowerCase() === 'button')
      .map((c) => {
        const subType = (c.sub_type ?? 'quick_reply').toLowerCase();
        const label = c.parameters?.[0]?.text ?? c.parameters?.[0]?.payload ?? 'Botão';
        if (subType === 'url') return { type: 'url' as const, text: label };
        if (subType === 'copy_code') return { type: 'copy_code' as const, text: label };
        return { type: 'quick_reply' as const, text: label };
      });

    return {
      kind: 'template',
      ...(request.template?.name ? { name: request.template.name } : {}),
      ...(header ? { header } : {}),
      body: part('body')?.parameters?.map((p) => p.text).filter(Boolean).join(' ') || request.template?.name || '',
      ...(part('footer')?.parameters?.[0]?.text ? { footer: part('footer')!.parameters![0]!.text! } : {}),
      ...(buttons.length > 0 ? { buttons } : {}),
    };
  }

  if (type === 'interactive') {
    const it = request.interactive;
    const body = it?.body?.text ?? '';
    const footer = it?.footer?.text;
    const headerText = it?.header?.text;

    if (it?.type === 'list') {
      const sections: ListSection[] = (it.action?.sections ?? []).map((s) => ({
        ...(s.title ? { title: s.title } : {}),
        rows: (s.rows ?? []).map((r) => ({
          id: r.id ?? '',
          title: r.title ?? '',
          ...(r.description ? { description: r.description } : {}),
        })),
      }));
      return {
        kind: 'list',
        ...(headerText ? { header: headerText } : {}),
        body,
        ...(footer ? { footer } : {}),
        buttonText: it.action?.button ?? 'Ver opções',
        sections,
      };
    }

    if (it?.type === 'flow') {
      return {
        kind: 'flow',
        ...(headerText ? { header: headerText } : {}),
        body,
        ...(footer ? { footer } : {}),
        ctaText: it.action?.parameters?.flow_cta ?? 'Abrir',
      };
    }

    if (it?.type === 'cta_url') {
      return {
        kind: 'buttons',
        ...(headerText ? { header: { type: 'text' as const, text: headerText } } : {}),
        body,
        ...(footer ? { footer } : {}),
        buttons: [{ type: 'url', text: it.action?.parameters?.flow_cta ?? 'Abrir link' }],
      };
    }

    const buttons: MessageButton[] = (it?.action?.buttons ?? []).map((b) => ({
      type: 'quick_reply' as const,
      text: b.reply?.title ?? 'Botão',
    }));
    return {
      kind: 'buttons',
      ...(headerText ? { header: { type: 'text' as const, text: headerText } } : {}),
      body,
      ...(footer ? { footer } : {}),
      buttons,
    };
  }

  return undefined;
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
      ...(contentOf(request, 'template') ? { content: contentOf(request, 'template')! } : {}),
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
    ...(contentOf(request, type) ? { content: contentOf(request, type)! } : {}),
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
  /** Why the delivery failed. Meta only sends this on `failed`. */
  errors?: Array<{ code: number; title: string; details?: string }>;
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

  if (options.errors && options.errors.length > 0) {
    status.errors = options.errors.map((error) => ({
      code: error.code,
      title: error.title,
      message: error.title,
      ...(error.details ? { error_data: { details: error.details } } : {}),
    }));
  }

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

/** Graph's own `type` for an inbound message, which is not the simulator's ContentType. */
const GRAPH_TYPE_BY_CONTENT_TYPE: Partial<Record<ContentType, string>> = {
  text: 'text',
  image: 'image',
  audio: 'audio',
  video: 'video',
  document: 'document',
  sticker: 'sticker',
  location: 'location',
};

/**
 * The `messages[0]` body of an inbound webhook.
 *
 * A reply to an interactive message is its own shape, and it is the shape a collections
 * flow is built on: the debtor is shown "À vista / 3x" and taps one. Flattening that to an
 * empty text message loses the one field the app routes on — the button's id — so the
 * reply is carried through as Meta sends it.
 */
function inboundMessageBody(message: SimMessage): Record<string, unknown> {
  const reply = message.interactiveReply;
  if (!reply) {
    return {
      type: (message.contentType && GRAPH_TYPE_BY_CONTENT_TYPE[message.contentType]) ?? 'text',
      text: { body: message.bodyPreview ?? '' },
    };
  }
  if (reply.type === 'nfm_reply') {
    return {
      type: 'interactive',
      interactive: {
        type: 'nfm_reply',
        nfm_reply: { name: 'flow', body: reply.title ?? 'Sent', response_json: reply.id },
      },
    };
  }
  return {
    type: 'interactive',
    interactive: {
      type: reply.type,
      [reply.type]: { id: reply.id, ...(reply.title ? { title: reply.title } : {}) },
    },
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
                  ...inboundMessageBody(message),
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
