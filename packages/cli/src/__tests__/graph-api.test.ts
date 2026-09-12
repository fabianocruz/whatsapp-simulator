import { describe, expect, it } from 'vitest';
import {
  GraphApiError,
  fromGraphSendRequest,
  toGraphSendResponse,
  toInboundWebhook,
  toStatusWebhook,
} from '../adapters/graph-api.js';

const SENT_AT = '2026-09-01T10:00:00.000Z';
const opts = { id: 'wamid.test', sentAt: SENT_AT };

describe('fromGraphSendRequest', () => {
  it('maps a plain text send to a service message', () => {
    const message = fromGraphSendRequest(
      { messaging_product: 'whatsapp', to: '+5511999999999', type: 'text', text: { body: 'oi' } },
      opts,
    );
    expect(message).toMatchObject({
      direction: 'business_to_user',
      kind: 'non_template',
      category: 'service',
      contentType: 'text',
      bodyPreview: 'oi',
      status: 'sent',
      sentAt: SENT_AT,
    });
  });

  it('maps a template send, taking the category from the hint the real API ignores', () => {
    const message = fromGraphSendRequest(
      {
        messaging_product: 'whatsapp',
        to: '+5511999999999',
        type: 'template',
        template: { name: 'promo_setembro', language: { code: 'pt_BR' }, category: 'MARKETING' },
      },
      opts,
    );
    expect(message.kind).toBe('template');
    expect(message.category).toBe('marketing');
    expect(message.templateName).toBe('promo_setembro');
  });

  it('falls back to the configured default category', () => {
    const message = fromGraphSendRequest(
      { type: 'template', template: { name: 'confirmacao' } },
      { ...opts, defaultTemplateCategory: 'utility' },
    );
    expect(message.category).toBe('utility');
  });

  it('refuses a template category it cannot price rather than guessing', () => {
    expect(() => fromGraphSendRequest({ type: 'template', template: { category: 'promotional' } }, opts)).toThrow(
      GraphApiError,
    );
  });

  it('maps interactive types to the right content type', () => {
    expect(fromGraphSendRequest({ type: 'interactive', interactive: { type: 'button' } }, opts).contentType).toBe(
      'interactive_buttons',
    );
    expect(fromGraphSendRequest({ type: 'interactive', interactive: { type: 'list' } }, opts).contentType).toBe(
      'interactive_list',
    );
    expect(fromGraphSendRequest({ type: 'interactive', interactive: { type: 'flow' } }, opts).contentType).toBe('flow');
  });

  it.each(['image', 'audio', 'video', 'document', 'sticker', 'location'])('maps %s media sends', (type) => {
    expect(fromGraphSendRequest({ type }, opts).contentType).toBe(type);
  });

  it('rejects a non-WhatsApp messaging product', () => {
    expect(() => fromGraphSendRequest({ messaging_product: 'sms', type: 'text' }, opts)).toThrow(GraphApiError);
  });

  it('rejects an unknown message type', () => {
    expect(() => fromGraphSendRequest({ type: 'carrier_pigeon' }, opts)).toThrow(/unsupported message type/);
  });
});

describe('toGraphSendResponse', () => {
  it('mirrors the Cloud API send response shape', () => {
    const message = fromGraphSendRequest({ type: 'text', text: { body: 'oi' } }, opts);
    expect(toGraphSendResponse(message, '+55 11 99999-9999')).toEqual({
      messaging_product: 'whatsapp',
      contacts: [{ input: '+55 11 99999-9999', wa_id: '5511999999999' }],
      messages: [{ id: 'wamid.test', message_status: 'accepted' }],
    });
  });
});

describe('toStatusWebhook', () => {
  const base = {
    phoneNumberId: '123456',
    displayPhoneNumber: '+55 11 90000-0000',
    recipient: '+5511999999999',
    timestamp: SENT_AT,
  };

  it('attaches the pricing block only on delivered, the way Meta does', () => {
    const sent = toStatusWebhook('wamid.test', { ...base, status: 'sent' }) as any;
    expect(sent.entry[0].changes[0].value.statuses[0].pricing).toBeUndefined();

    const delivered = toStatusWebhook('wamid.test', {
      ...base,
      status: 'delivered',
      pricing: { billable: true, category: 'marketing' },
    }) as any;
    expect(delivered.entry[0].changes[0].value.statuses[0].pricing).toEqual({
      billable: true,
      pricing_model: 'PMP',
      type: 'regular',
      category: 'marketing',
    });
  });

  it('marks a free in-window message as free_customer_service', () => {
    const payload = toStatusWebhook('wamid.test', {
      ...base,
      status: 'delivered',
      pricing: { billable: false, category: 'service' },
    }) as any;
    expect(payload.entry[0].changes[0].value.statuses[0].pricing.type).toBe('free_customer_service');
  });

  it('uses second-precision unix timestamps', () => {
    const payload = toStatusWebhook('wamid.test', { ...base, status: 'sent' }) as any;
    expect(payload.entry[0].changes[0].value.statuses[0].timestamp).toBe(String(Date.parse(SENT_AT) / 1000));
  });
});

describe('toInboundWebhook', () => {
  it('carries an ad referral so the simulator can open a free entry point', () => {
    const payload = toInboundWebhook(
      {
        id: 'wamid.in',
        direction: 'user_to_business',
        kind: 'non_template',
        category: 'service',
        sentAt: SENT_AT,
        status: 'delivered',
        contentType: 'text',
        entryPoint: 'click_to_whatsapp_ad',
        bodyPreview: 'vi o anuncio',
      },
      { phoneNumberId: '123456', displayPhoneNumber: '+55 11 90000-0000', from: '+5511999999999' },
    ) as any;
    const message = payload.entry[0].changes[0].value.messages[0];
    expect(message.referral).toEqual({ source_type: 'ad' });
    expect(message.text.body).toBe('vi o anuncio');
  });

  it('omits the referral for an organic arrival', () => {
    const payload = toInboundWebhook(
      {
        id: 'wamid.in',
        direction: 'user_to_business',
        kind: 'non_template',
        category: 'service',
        sentAt: SENT_AT,
        status: 'delivered',
        entryPoint: 'organic',
      },
      { phoneNumberId: '123456', displayPhoneNumber: '+55 11 90000-0000', from: '+5511999999999' },
    ) as any;
    expect(payload.entry[0].changes[0].value.messages[0].referral).toBeUndefined();
  });
});
