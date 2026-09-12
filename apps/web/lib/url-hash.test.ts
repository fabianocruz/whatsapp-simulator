import { describe, expect, it } from 'vitest';
import type { SimMessage } from '@dyvit/whatsapp-pricing';
import { getScenario } from '@dyvit/whatsapp-scenarios';
import { decodeState, encodeState } from './url-hash';
import { emptyState, type SimulatorState } from './scenario-state';

function state(overrides: Partial<SimulatorState> = {}): SimulatorState {
  return { ...emptyState(), asOf: '2026-09-01', ...overrides };
}

describe('URL hash round-trip', () => {
  it('preserves a full scenario exactly', () => {
    const original = state({
      messages: getScenario('worked-example-spec').messages as SimMessage[],
      conversationsPerMonth: 30_000,
      phoneNumbers: 3,
      compare: true,
      locale: 'en',
    });
    const decoded = decodeState(`#s=${encodeState(original)}`);
    expect(decoded).toEqual(original);
  });

  it('survives accented and emoji message bodies', () => {
    // btoa(JSON.stringify(...)) throws on these; going through TextEncoder does not.
    const original = state({
      messages: [
        {
          id: 'm1',
          direction: 'business_to_user',
          kind: 'non_template',
          category: 'service',
          sentAt: '2026-09-01T10:00:00.000Z',
          status: 'delivered',
          bodyPreview: 'Confirmação de pagamento — R$ 1.234,56 ✅ 🇧🇷',
        },
      ],
    });
    const decoded = decodeState(encodeState(original));
    expect(decoded!.messages[0]!.bodyPreview).toBe('Confirmação de pagamento — R$ 1.234,56 ✅ 🇧🇷');
  });

  it('is stable: the same scenario always produces the same link', () => {
    const a = state({ messages: getScenario('otp-authentication').messages as SimMessage[] });
    const b = state({ messages: getScenario('otp-authentication').messages as SimMessage[] });
    expect(encodeState(a)).toBe(encodeState(b));
  });

  it('produces a hash safe to drop in a URL', () => {
    const encoded = encodeState(state({ messages: getScenario('suporte-longo').messages as SimMessage[] }));
    expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  it('accepts the hash with or without the # and the s= prefix', () => {
    const encoded = encodeState(state());
    expect(decodeState(encoded)).toEqual(decodeState(`#s=${encoded}`));
    expect(decodeState(`#${encoded}`)).toEqual(decodeState(encoded));
  });

  it('returns null rather than blanking the app on a broken link', () => {
    expect(decodeState('')).toBeNull();
    expect(decodeState('#s=not-base64!!')).toBeNull();
    expect(decodeState('#s=' + btoa('{"nope":1}'))).toBeNull();
  });

  it('rejects a payload from a future serialization version', () => {
    const encoded = encodeState(state());
    const wire = JSON.parse(new TextDecoder().decode(Buffer.from(encoded, 'base64url')));
    wire.v = 99;
    expect(decodeState(Buffer.from(JSON.stringify(wire)).toString('base64url'))).toBeNull();
  });
});
