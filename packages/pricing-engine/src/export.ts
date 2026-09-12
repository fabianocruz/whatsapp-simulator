import type { PricedConversation } from './types';

/**
 * The per-message breakdown as CSV.
 *
 * Lives in the engine rather than in each consumer because the CLI's `--csv` and the web
 * app's export button must produce byte-identical files: a developer comparing the two is
 * checking the engine, not the exporter.
 */

export const CSV_COLUMNS = [
  'message_id',
  'ruleset',
  'rule_id',
  'category',
  'market',
  'currency',
  'csw_open',
  'fep_active',
  'billable',
  'unit_rate',
  'tier_applied',
  'amount',
  'reason_code',
  'explanation_pt',
  'explanation_en',
] as const;

function escapeCsv(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function toCsv(priced: PricedConversation): string {
  const rows = priced.decisions.map((decision) =>
    [
      decision.messageId,
      decision.rulesetVersion,
      decision.ruleId,
      decision.category,
      decision.market,
      decision.currency,
      decision.windowState.cswOpen,
      decision.windowState.fepActive,
      decision.billable,
      decision.unitRate ?? '',
      decision.tierApplied ?? '',
      decision.amount,
      decision.reasonCode,
      decision.explanation.pt,
      decision.explanation.en,
    ]
      .map(escapeCsv)
      .join(','),
  );
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}
