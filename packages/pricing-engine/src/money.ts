/**
 * Money is held as integer micro-units (1 unit = 1_000_000 micros).
 *
 * Rates carry four decimals (R$ 0,3217) and a conversation sums dozens of them. In IEEE
 * doubles 0.3217 + 0.035 is 0.35670000000000002, which turns a golden test into a
 * flake and a taximeter into a liar. Every sum in the engine happens in integers; the
 * conversion back to a decimal number happens once, at the edge.
 */

export const MICROS_PER_UNIT = 1_000_000;

/** Converts a decimal rate (0.3217) to micros (321700). */
export function toMicros(amount: number): number {
  if (!Number.isFinite(amount)) throw new TypeError(`cannot convert ${amount} to micros`);
  return Math.round(amount * MICROS_PER_UNIT);
}

/** Converts micros back to a decimal number, rounded to 6 places. */
export function fromMicros(micros: number): number {
  return Math.round(micros) / MICROS_PER_UNIT;
}

export function sumMicros(values: readonly number[]): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

/**
 * Formats an amount for display. Four decimals by default because that is the precision
 * Meta publishes rates at, and rounding a per-message rate to cents hides the difference
 * between R$ 0,0350 and R$ 0,0263.
 */
export function formatMoney(
  amount: number,
  currency: 'BRL' | 'USD',
  locale: 'pt-BR' | 'en-US' = 'pt-BR',
  fractionDigits = 4,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(amount);
}
