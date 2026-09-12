import { autoFractionDigits, formatMoney, REASON_LABELS, toCsv } from '@dyvit/whatsapp-pricing';
import type { PricedConversation, SimMessage } from '@dyvit/whatsapp-pricing';
import type { Tip } from '@dyvit/whatsapp-tips';

export type Locale = 'pt' | 'en';

const MONEY_LOCALE = { pt: 'pt-BR', en: 'en-US' } as const;

export function money(amount: number, currency: 'BRL' | 'USD', locale: Locale, digits = 4): string {
  return formatMoney(amount, currency, MONEY_LOCALE[locale], digits);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value : value + ' '.repeat(width - value.length);
}

function padStart(value: string, width: number): string {
  return value.length >= width ? value : ' '.repeat(width - value.length) + value;
}

/** Renders a priced conversation as an aligned table. */
export function renderTable(priced: PricedConversation, messages: readonly SimMessage[], locale: Locale): string {
  const byId = new Map(messages.map((m) => [m.id, m]));
  const rows = priced.decisions.map((decision) => {
    const message = byId.get(decision.messageId);
    const side = message?.direction === 'user_to_business' ? '<-' : '->';
    const window = [decision.windowState.cswOpen ? 'CSW' : '', decision.windowState.fepActive ? 'FEP' : '']
      .filter(Boolean)
      .join('+');
    return [
      decision.messageId,
      message?.sentAt.slice(5, 16).replace('T', ' ') ?? '',
      side,
      decision.category,
      window || '-',
      decision.billable ? money(decision.amount, decision.currency, locale) : '-',
      REASON_LABELS[decision.reasonCode][locale],
    ];
  });

  const headers =
    locale === 'pt'
      ? ['id', 'quando', '', 'categoria', 'janela', 'custo', 'motivo']
      : ['id', 'when', '', 'category', 'window', 'cost', 'reason'];

  const widths = headers.map((header, index) =>
    Math.max(header.length, ...rows.map((row) => String(row[index] ?? '').length)),
  );

  const line = (cells: readonly string[]) =>
    cells.map((cell, index) => (index === 5 ? padStart(cell, widths[index]!) : pad(cell, widths[index]!))).join('  ');

  return [
    line(headers),
    widths.map((width) => '-'.repeat(width)).join('  '),
    ...rows.map((row) => line(row.map((cell) => String(cell ?? '')))),
  ].join('\n');
}

export function renderSummary(priced: PricedConversation, locale: Locale): string {
  const lines: string[] = [];
  const total = money(priced.total, priced.currency, locale);
  lines.push(
    locale === 'pt'
      ? `Total: ${total}  ·  ${priced.billableCount} de ${priced.decisions.length} mensagens cobradas  ·  ruleset ${priced.ruleSet.id}`
      : `Total: ${total}  ·  ${priced.billableCount} of ${priced.decisions.length} messages billed  ·  ruleset ${priced.ruleSet.id}`,
  );
  for (const row of priced.breakdown) {
    if (row.amountMicros === 0 && row.billableMessages === 0) continue;
    lines.push(
      `  ${pad(row.category, 16)} ${padStart(money(row.amount, priced.currency, locale), 12)}  (${row.billableMessages}/${row.messages})`,
    );
  }
  return lines.join('\n');
}

export function renderTips(tips: readonly Tip[], locale: Locale): string {
  if (tips.length === 0) return locale === 'pt' ? '(sem dicas para este cenário)' : '(no tips for this scenario)';
  return tips
    .map((tip) => {
      const title = locale === 'pt' ? tip.titlePt : tip.titleEn;
      const text = locale === 'pt' ? tip.textPt : tip.textEn;
      const saving =
        tip.estimatedSavingMicros > 0
          ? ` [${money(tip.estimatedSaving, tip.currency, locale, autoFractionDigits(tip.estimatedSaving))}]`
          : '';
      return `[${tip.ruleId}] ${title}${saving}\n    ${text}`;
    })
    .join('\n\n');
}

export function renderWarnings(priced: PricedConversation, locale: Locale): string {
  const lines = priced.warnings.map((w) => `  ! ${w.subject}: ${w.message[locale]}`);
  const issues = priced.issues.map((i) => `  ! ${i.messageId}: ${i.message[locale]}`);
  return [...lines, ...issues].join('\n');
}

// The CSV export lives in the engine so the CLI and the web app cannot drift apart.
export { toCsv as renderCsv };
