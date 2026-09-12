import type { Metadata } from 'next';
import Link from 'next/link';
import { formatMoney, listMarkets, selectRateCard, selectRuleSet } from '@dyvit/whatsapp-pricing';

/**
 * One indexable calculator page per market.
 *
 * This is the SEO surface the launch plan asks for: static, readable without JavaScript,
 * and carrying the rates and tiers straight from the versioned dataset so the page can
 * never drift from the engine.
 */

export const dynamicParams = false;

export function generateStaticParams() {
  return listMarkets().map((entry) => ({ market: entry.market.toLowerCase() }));
}

function load(market: string) {
  // Rates are quoted "as of today"; the ruleset in force decides what is billable.
  const asOf = new Date().toISOString().slice(0, 10);
  return {
    rateCard: selectRateCard(market, market.toUpperCase() === 'BR' ? 'BRL' : 'USD', asOf),
    ruleSet: selectRuleSet(asOf),
    futureRuleSet: selectRuleSet('2026-10-01'),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ market: string }> }): Promise<Metadata> {
  const { market } = await params;
  const { rateCard } = load(market);
  const title = `Preco WhatsApp Business API no ${rateCard.marketName.pt} (${rateCard.currency})`;
  return {
    title: `${title} · Dyvit`,
    description: `Marketing ${formatMoney(rateCard.rates.marketing, rateCard.currency)}, utility e authentication ${formatMoney(rateCard.rates.utility, rateCard.currency)} por mensagem entregue. Tiers de volume e o que muda em 01/10/2026.`,
  };
}

export default async function CalculatorPage({ params }: { params: Promise<{ market: string }> }) {
  const { market } = await params;
  const { rateCard, ruleSet, futureRuleSet } = load(market);

  const rows = [
    {
      category: 'Marketing',
      rate: rateCard.rates.marketing,
      note: 'Cobrado em toda entrega, dentro ou fora da janela. Sem tiers de volume.',
    },
    {
      category: 'Utility',
      rate: rateCard.rates.utility,
      note: ruleSet.utilityFreeInCSW
        ? 'Gratis dentro da janela de atendimento de 24h ate 30/09/2026. Tiers de volume ate -25%.'
        : 'Cobrado tambem dentro da janela de 24h. Tiers de volume ate -25%.',
    },
    {
      category: 'Authentication',
      rate: rateCard.rates.authentication,
      note: 'Sempre cobrado na entrega. Tiers de volume ate -25%.',
    },
    {
      category: 'Service',
      rate: ruleSet.serviceMessagesBillable ? rateCard.rates.utility : 0,
      note: ruleSet.serviceMessagesBillable
        ? `Cobrado ao rate de utility. Franquia de ${futureRuleSet.serviceFreeAllowancePerMonth} mensagens gratis por mes por numero.`
        : `Gratis dentro da janela de 24h ate 30/09/2026. Depois: ${formatMoney(rateCard.rates.utility, rateCard.currency)} com franquia de ${futureRuleSet.serviceFreeAllowancePerMonth}/mes por numero.`,
    },
  ];

  const tiers = rateCard.volumeTiers.find((table) => table.category === 'utility');

  return (
    <main className="mx-auto w-full max-w-[860px] px-5 py-14 sm:px-8">
      <p className="section-label">Dyvit · open source</p>
      <h1 className="mt-2 text-[clamp(26px,4vw,40px)] leading-[1.05]">
        Preco do WhatsApp Business API no {rateCard.marketName.pt}
      </h1>
      <p className="mt-3 max-w-2xl text-[15px] text-[color:var(--color-ink-70)]">
        Rates oficiais por categoria em {rateCard.currency}, vigentes desde {rateCard.effectiveFrom}, mais os tiers de
        volume e o que muda em 01/10/2026.
      </p>

      <div className="mt-8 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse text-left text-[13px]">
          <caption className="sr-only">Rates por categoria de mensagem</caption>
          <thead>
            <tr className="border-b border-[color:var(--color-ink-15)]">
              <th scope="col" className="mono py-2 text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
                Categoria
              </th>
              <th scope="col" className="mono py-2 text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
                Rate
              </th>
              <th scope="col" className="mono py-2 text-[10px] uppercase tracking-widest text-[color:var(--color-ink-40)]">
                Observacoes
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.category} className="border-b border-[color:var(--color-ink-07)] align-top">
                <th scope="row" className="py-3 pr-4 font-semibold">
                  {row.category}
                </th>
                <td className="mono py-3 pr-4 whitespace-nowrap">
                  {row.rate === 0 ? 'gratis' : formatMoney(row.rate, rateCard.currency)}
                </td>
                <td className="py-3 text-[color:var(--color-ink-70)]">{row.note}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {tiers && (
        <>
          <h2 className="mt-10 text-[20px]">Tiers de volume (utility e authentication)</h2>
          <p className="mt-2 text-[13px] text-[color:var(--color-ink-70)]">
            Descontos progressivos sobre o volume mensal de mensagens cobradas, agregado no nivel do business
            portfolio e resetado todo dia 1º. O rate de cada tier vale para as mensagens dentro daquele tier.
          </p>
          {!tiers.tiersVerified && (
            <p className="mono mt-3 rounded-[var(--radius-r)] border border-[color:var(--color-ink-15)] bg-[color:var(--color-ink-04)] p-3 text-[11px] text-[color:var(--color-ink-70)]">
              Os limites de mensagens por tier abaixo sao placeholder e ainda nao foram confirmados contra o rate card
              oficial da Meta. Os percentuais de desconto e os rates resultantes vem da fonte citada.
            </p>
          )}
          <ul className="mono mt-4 space-y-1 text-[13px]">
            {tiers.tiers.map((tier) => (
              <li key={tier.from} className="flex justify-between border-b border-[color:var(--color-ink-07)] py-1.5">
                <span className="text-[color:var(--color-ink-70)]">
                  {tier.from.toLocaleString('pt-BR')} – {tier.to === null ? '∞' : tier.to.toLocaleString('pt-BR')}
                </span>
                <span>
                  {formatMoney(tier.rate, rateCard.currency)}
                  {tier.discountPct > 0 && ` (-${tier.discountPct}%)`}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2 className="mt-10 text-[20px]">O que muda em 01/10/2026</h2>
      <ul className="mt-3 space-y-2 text-[14px] text-[color:var(--color-ink-70)]">
        <li>Mensagens de service (respostas non-template) passam a ser cobradas ao rate de utility/authentication.</li>
        <li>Templates utility dentro da janela de 24h voltam a ser cobrados.</li>
        <li>
          Cada numero de telefone ganha uma franquia de {futureRuleSet.serviceFreeAllowancePerMonth} mensagens de
          service gratis por mes, sem acumulo.
        </li>
        <li>A janela de free entry point de 72h continua gratis.</li>
      </ul>

      <p className="mt-10">
        <Link
          href="/"
          className="inline-block rounded-[var(--radius-r)] bg-[color:var(--color-ink)] px-5 py-2.5 text-[14px] font-medium text-[color:var(--color-paper)]"
        >
          Abrir o simulador
        </Link>
      </p>

      <p className="mt-8 text-[12px] leading-relaxed text-[color:var(--color-ink-40)]">
        Fonte: <a className="underline" href={rateCard.sourceUrl} rel="noreferrer noopener" target="_blank">{rateCard.sourceUrl}</a>.
        Simulacao educacional: a cobranca oficial e a da Meta e impostos brasileiros podem incidir sobre estes valores.
      </p>
    </main>
  );
}
