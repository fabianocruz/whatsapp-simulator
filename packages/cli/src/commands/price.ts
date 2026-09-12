import { readFile, writeFile } from 'node:fs/promises';
import { compareRulesets, projectMonthly, volumeFromConversation } from '@dyvit/whatsapp-pricing';
import type { Currency, SimMessage } from '@dyvit/whatsapp-pricing';
import { SCENARIOS, getScenario } from '@dyvit/whatsapp-scenarios';
import { analyzeConversation } from '@dyvit/whatsapp-tips';
import { money, renderCsv, renderSummary, renderTable, renderTips, renderWarnings, type Locale } from '../format';

export interface PriceOptions {
  scenario?: string;
  file?: string;
  asOf?: string;
  market?: string;
  currency?: Currency;
  conversationsPerMonth?: number;
  phoneNumbers?: number;
  locale: Locale;
  json: boolean;
  csv?: string;
  compare: boolean;
}

interface ScenarioFile {
  name?: string;
  market?: string;
  currency?: Currency;
  asOf?: string;
  messages: SimMessage[];
}

async function loadScenario(options: PriceOptions): Promise<ScenarioFile & { name: string }> {
  if (options.file) {
    const raw = await readFile(options.file, 'utf8');
    const parsed = JSON.parse(raw) as ScenarioFile;
    if (!Array.isArray(parsed.messages)) {
      throw new Error(`${options.file} has no "messages" array`);
    }
    return { ...parsed, name: parsed.name ?? options.file };
  }
  const slug = options.scenario ?? 'worked-example-spec';
  const scenario = getScenario(slug);
  return { ...scenario, name: scenario.name };
}

export async function runPrice(options: PriceOptions): Promise<number> {
  const scenario = await loadScenario(options);
  const asOf = options.asOf ?? scenario.asOf ?? new Date().toISOString().slice(0, 10);
  const market = options.market ?? scenario.market ?? 'BR';
  const currency = options.currency ?? scenario.currency ?? 'BRL';

  const { priced, future, tips } = analyzeConversation(scenario.messages, {
    asOf,
    market,
    currency,
    ...(options.conversationsPerMonth === undefined ? {} : { conversationsPerMonth: options.conversationsPerMonth }),
    ...(options.phoneNumbers === undefined ? {} : { phoneNumbers: options.phoneNumbers }),
  });

  const projection =
    options.conversationsPerMonth === undefined
      ? null
      : projectMonthly(volumeFromConversation(priced, options.conversationsPerMonth), {
          asOf,
          market,
          currency,
          ...(options.phoneNumbers === undefined ? {} : { phoneNumbers: options.phoneNumbers }),
        });

  if (options.csv) {
    await writeFile(options.csv, renderCsv(priced), 'utf8');
  }

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify({ scenario: scenario.name, asOf, market, currency, priced, future, tips, projection }, null, 2)}\n`,
    );
    return 0;
  }

  const pt = options.locale === 'pt';
  const out: string[] = [];
  out.push(`${scenario.name}  ·  ${pt ? 'regras de' : 'rules as of'} ${asOf}  ·  ${market}/${currency}`);
  out.push('');
  out.push(renderTable(priced, scenario.messages, options.locale));
  out.push('');
  out.push(renderSummary(priced, options.locale));

  if (options.compare) {
    const comparison = compareRulesets(scenario.messages, { asOf, market, currency }, '2026-10-01');
    out.push('');
    out.push(
      pt
        ? `Comparação com 01/10/2026: ${money(comparison.current.total, currency, 'pt')} -> ${money(comparison.future.total, currency, 'pt')} (${comparison.delta >= 0 ? '+' : ''}${money(comparison.delta, currency, 'pt')})`
        : `Compared with 2026-10-01: ${money(comparison.current.total, currency, 'en')} -> ${money(comparison.future.total, currency, 'en')} (${comparison.delta >= 0 ? '+' : ''}${money(comparison.delta, currency, 'en')})`,
    );
  }

  if (projection) {
    out.push('');
    out.push(
      pt
        ? `Projeção mensal (${options.conversationsPerMonth!.toLocaleString('pt-BR')} conversas): ${money(projection.total, currency, 'pt', 2)}`
        : `Monthly projection (${options.conversationsPerMonth!.toLocaleString('en-US')} conversations): ${money(projection.total, currency, 'en', 2)}`,
    );
    for (const category of projection.categories) {
      out.push(
        `  ${category.category}: ${category.messages.toLocaleString(pt ? 'pt-BR' : 'en-US')} ${pt ? 'msgs' : 'msgs'} -> ${money(category.amount, currency, options.locale, 2)}` +
          (category.freeByAllowance > 0
            ? pt
              ? ` (${category.freeByAllowance.toLocaleString('pt-BR')} grátis pela franquia)`
              : ` (${category.freeByAllowance.toLocaleString('en-US')} free via allowance)`
            : ''),
      );
      for (const slice of category.slices) {
        if (category.slices.length < 2) continue;
        out.push(
          `      ${slice.messages.toLocaleString(pt ? 'pt-BR' : 'en-US')} @ ${money(slice.rate, currency, options.locale)}${slice.discountPct ? ` (-${slice.discountPct}%)` : ''}`,
        );
      }
    }
  }

  out.push('');
  out.push(pt ? 'Dicas' : 'Tips');
  out.push(renderTips(tips, options.locale));

  const warnings = renderWarnings(priced, options.locale);
  if (warnings) {
    out.push('');
    out.push(pt ? 'Avisos sobre os dados' : 'Data warnings');
    out.push(warnings);
  }

  out.push('');
  out.push(
    pt
      ? 'Simulação educacional. A cobrança oficial é a da Meta.'
      : 'Educational simulation. The official bill is Meta’s.',
  );

  process.stdout.write(`${out.join('\n')}\n`);
  return priced.issues.length > 0 ? 1 : 0;
}

export function listScenarios(): string {
  return SCENARIOS.map((s) => `  ${s.slug.padEnd(24)} ${s.name}`).join('\n');
}
