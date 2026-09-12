import { toCsv } from '@dyvit/whatsapp-pricing';
import type { PricedConversation } from '@dyvit/whatsapp-pricing';
import type { Tip } from '@dyvit/whatsapp-tips';
import type { SimulatorState } from './scenario-state';

// Re-exported so callers import one thing; the implementation is the engine's, shared
// with the CLI so both exports are byte-identical.
export { toCsv };

export function toJson(state: SimulatorState, priced: PricedConversation, tips: readonly Tip[]): string {
  return JSON.stringify(
    {
      generatedBy: 'dyvit/whatsapp-simulator',
      disclaimer: 'Educational simulation. The official bill is Meta’s.',
      scenario: {
        market: state.market,
        currency: state.currency,
        asOf: state.asOf,
        conversationsPerMonth: state.conversationsPerMonth,
        messages: state.messages,
      },
      ruleset: priced.ruleSet.id,
      rateCard: { effectiveFrom: priced.rateCard.effectiveFrom, sourceUrl: priced.rateCard.sourceUrl },
      total: priced.total,
      breakdown: priced.breakdown,
      decisions: priced.decisions,
      tips,
      warnings: priced.warnings,
    },
    null,
    2,
  );
}

/** Triggers a client-side file download. No server round trip; nothing leaves the browser. */
export function download(filename: string, contents: string, mimeType: string): void {
  const blob = new Blob([contents], { type: `${mimeType};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers; one tick is enough.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
