#!/usr/bin/env node
/**
 * Regenerates a rate card from Meta's own published pricing data.
 *
 * The rates and volume tiers on whatsappbusiness.com's pricing page are served by a
 * public JSON endpoint that the page itself calls. Reading that endpoint is how this
 * dataset stays honest: the numbers come from Meta, not from a blog post, and anyone can
 * re-run this to check them. See CONTRIBUTING.md for the quarterly update process.
 *
 * Usage:
 *   node scripts/fetch-rate-card.mjs --market BR --currency BRL --effective-from 2026-07-01
 *   node scripts/fetch-rate-card.mjs --market BR --currency BRL --check   # diff only
 */

import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const PRICING_PAGE = 'https://whatsappbusiness.com/products/platform-pricing/';
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36';

/** Meta's sentinel for "and everything above": 2^61 - 1. */
const UNBOUNDED = 2305843009213693951;

const CATEGORIES = { marketing: 'Marketing', utility: 'Utility', authentication: 'Authentication' };
const TIERED = ['utility', 'authentication'];

const MARKET_NAMES = {
  BR: { pt: 'Brasil', en: 'Brazil' },
};
const CALLING_CODES = { BR: '+55' };

/**
 * The endpoint is nonce-protected. Both nonces are embedded in the pricing page, and the
 * page's own script sends one as a query parameter and the other as a header.
 */
async function openSession() {
  const response = await fetch(PRICING_PAGE, { headers: { 'user-agent': USER_AGENT } });
  if (!response.ok) throw new Error(`pricing page returned ${response.status}`);
  const html = await response.text();
  const restUrl = html.match(/"restUrl":"([^"]+)"/)?.[1]?.replace(/\\\//g, '/');
  const restNonce = html.match(/"restNonce":"([a-f0-9]+)"/)?.[1];
  const wpNonce = html.match(/"wpNonce":"([a-f0-9]+)"/)?.[1];
  if (!restUrl || !restNonce || !wpNonce) {
    throw new Error('could not read the pricing endpoint or its nonces from the page; the page markup changed');
  }
  return { restUrl, restNonce, wpNonce };
}

async function fetchCategory(session, market, currency, category) {
  const url = new URL(session.restUrl);
  url.searchParams.set('market', market);
  url.searchParams.set('currency', currency);
  url.searchParams.set('category', category);
  url.searchParams.set('_wab_nonce', session.restNonce);
  const response = await fetch(url, {
    headers: { 'user-agent': USER_AGENT, accept: 'application/json', 'X-WP-Nonce': session.wpNonce, referer: PRICING_PAGE },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${category} ${market}/${currency}: ${response.status} ${body}`);
  return JSON.parse(body);
}

/**
 * Meta publishes inclusive message ranges (1..250000, 250001..2000000). The engine works
 * in half-open positions where the month's first billable message sits at position 0, so
 * an inclusive `min_volume` of 250001 becomes an exclusive lower bound of 250000.
 */
function toTiers(tierList, listRate) {
  return tierList.map((tier) => {
    const rate = Number(tier.quote);
    return {
      from: tier.min_volume === 0 ? 0 : tier.min_volume - 1,
      to: tier.max_volume >= UNBOUNDED ? null : tier.max_volume,
      discountPct: Math.round((1 - rate / listRate) * 100),
      rate,
    };
  });
}

async function build(market, currency, effectiveFrom) {
  const session = await openSession();
  const rates = {};
  const volumeTiers = [];

  for (const [key, label] of Object.entries(CATEGORIES)) {
    const data = await fetchCategory(session, market, currency, label);
    rates[key] = Number(data.quote);
    if (TIERED.includes(key)) {
      if (!Array.isArray(data.tier_list) || data.tier_list.length === 0) {
        throw new Error(`${key}: expected a volume tier list, got none`);
      }
      volumeTiers.push({ category: key, tiersVerified: true, tiers: toTiers(data.tier_list, rates[key]) });
    } else if (Array.isArray(data.tier_list) && data.tier_list.length > 0) {
      throw new Error(`${key}: unexpected volume tiers — the pricing model changed, update this script`);
    }
  }

  return {
    market,
    marketName: MARKET_NAMES[market] ?? { pt: market, en: market },
    callingCode: CALLING_CODES[market] ?? '',
    currency,
    effectiveFrom,
    effectiveTo: null,
    rates,
    ratesVerified: true,
    volumeTiers,
    sourceUrl: PRICING_PAGE,
    verifiedAt: new Date().toISOString().slice(0, 10),
    notes: {
      pt: `Rate card oficial ${market}/${currency}, extraido de ${PRICING_PAGE} por scripts/fetch-rate-card.mjs. Impostos brasileiros podem incidir sobre estes valores.`,
      en: `Official ${market}/${currency} rate card, pulled from ${PRICING_PAGE} by scripts/fetch-rate-card.mjs. Brazilian taxes may apply on top of these amounts.`,
    },
  };
}

const { values } = parseArgs({
  options: {
    market: { type: 'string', default: 'BR' },
    currency: { type: 'string', default: 'BRL' },
    'effective-from': { type: 'string', default: '2026-07-01' },
    check: { type: 'boolean', default: false },
  },
});

const market = values.market.toUpperCase();
const currency = values.currency.toUpperCase();
const target = join(
  REPO_ROOT,
  'packages/pricing-data/data/rate-cards',
  `${market.toLowerCase()}-${currency}`,
  `${values['effective-from']}.json`,
);

const card = await build(market, currency, values['effective-from']);
const serialized = `${JSON.stringify(card, null, 2)}\n`;

/** Everything except when we last looked, which is metadata about us, not about the data. */
function withoutStamp(json) {
  if (!json) return '';
  try {
    const { verifiedAt, ...rest } = JSON.parse(json);
    return JSON.stringify(rest);
  } catch {
    return json;
  }
}

if (values.check) {
  const current = existsSync(target) ? readFileSync(target, 'utf8') : '';
  if (withoutStamp(current) === withoutStamp(serialized)) {
    process.stdout.write(`up to date: ${target.slice(REPO_ROOT.length + 1)}\n`);
  } else {
    process.stdout.write(`DRIFT: ${target.slice(REPO_ROOT.length + 1)} differs from what Meta publishes today.\n`);
    process.stdout.write('Re-run without --check to update, and review the diff before committing.\n');
    process.exitCode = 1;
  }
} else {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, serialized);
  process.stdout.write(`wrote ${target.slice(REPO_ROOT.length + 1)}\n`);
}
