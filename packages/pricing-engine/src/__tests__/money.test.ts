import { describe, expect, it } from 'vitest';
import { formatMoney, fromMicros, sumMicros, toMicros } from '../money';

describe('micro-unit arithmetic', () => {
  it('keeps four-decimal rates exact through a sum that floats get wrong', () => {
    // A marketing template plus a utility template at the -10% tier: both rates come
    // straight off the Brazilian card, and in IEEE doubles their sum lands on
    // 0.35319999999999996.
    expect(0.3217 + 0.0315).not.toBe(0.3532);
    expect(fromMicros(sumMicros([toMicros(0.3217), toMicros(0.0315)]))).toBe(0.3532);

    // Three service messages at the -5% tier: 0.09990000000000002 in doubles.
    expect(0.0333 + 0.0333 + 0.0333).not.toBe(0.0999);
    expect(fromMicros(sumMicros(Array.from({ length: 3 }, () => toMicros(0.0333))))).toBe(0.0999);
  });

  it('round-trips every rate in the shipped Brazilian card', () => {
    for (const rate of [0.3217, 0.035, 0.0333, 0.0315, 0.0298, 0.028, 0.0263]) {
      expect(fromMicros(toMicros(rate))).toBe(rate);
    }
  });

  it('stays exact across a thousand messages', () => {
    const micros = sumMicros(Array.from({ length: 1_000 }, () => toMicros(0.0263)));
    expect(fromMicros(micros)).toBe(26.3);
  });

  it('rejects non-finite input', () => {
    expect(() => toMicros(Number.NaN)).toThrow(TypeError);
    expect(() => toMicros(Number.POSITIVE_INFINITY)).toThrow(TypeError);
  });
});

describe('formatMoney', () => {
  it('shows four decimals so per-message rates stay distinguishable', () => {
    expect(formatMoney(0.035, 'BRL', 'pt-BR')).toContain('0,0350');
    expect(formatMoney(0.0263, 'BRL', 'pt-BR')).toContain('0,0263');
  });

  it('can round to cents for totals', () => {
    expect(formatMoney(1007, 'BRL', 'pt-BR', 2)).toContain('1.007,00');
  });
});
