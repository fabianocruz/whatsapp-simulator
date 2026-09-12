import { formatMoney } from '@dyvit/whatsapp-pricing';
import type { Currency } from '@dyvit/whatsapp-pricing';
import type { Locale } from '../i18n/dictionary';

const INTL_LOCALE: Record<Locale, 'pt-BR' | 'en-US'> = { pt: 'pt-BR', en: 'en-US' };

export function money(amount: number, currency: Currency, locale: Locale, digits = 4): string {
  return formatMoney(amount, currency, INTL_LOCALE[locale], digits);
}

export function count(value: number, locale: Locale): string {
  return new Intl.NumberFormat(INTL_LOCALE[locale]).format(value);
}

/** Time of day plus short date, always in UTC so a shared link reads the same everywhere. */
export function clockTime(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '--:--';
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

export function shortDate(iso: string, locale: Locale): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat(INTL_LOCALE[locale], {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'UTC',
  }).format(date);
}

/** `datetime-local` input value (local time) from an ISO instant. */
export function toDateTimeLocal(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const offsetMs = date.getTime() - date.getTimezoneOffset() * 60_000;
  return new Date(offsetMs).toISOString().slice(0, 16);
}

export function fromDateTimeLocal(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date().toISOString() : parsed.toISOString();
}
