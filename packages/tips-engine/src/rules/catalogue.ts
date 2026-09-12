import { distanceToNextTier, toMicros } from '@dyvit/whatsapp-pricing';
import { both, businessRuns, hoursBetween, looksTransactional, tip } from '../helpers';
import type { TipRule } from '../types';

/**
 * T1 — consecutive non-template replies inside one window.
 *
 * Free today, one charge each from 2026-10-01. Consolidating N replies into one saves
 * (N-1) service charges per run.
 */
export const consolidateReplies: TipRule = (ctx) => {
  const runs = businessRuns(ctx.sorted, (m) => m.kind === 'non_template').filter((run) => run.length >= 2);
  if (runs.length === 0) return null;

  const extraMessages = runs.reduce((sum, run) => sum + run.length - 1, 0);
  const serviceRate = ctx.rateCard.rates.utility;
  const savingMicros = toMicros(serviceRate) * extraMessages;
  const money = both(savingMicros, ctx.currency);

  return tip({
    ruleId: 'T1',
    severity: 'saving',
    triggeredBy: runs.flat().map((m) => m.id),
    currency: ctx.currency,
    titlePt: 'Consolide suas respostas',
    titleEn: 'Consolidate your replies',
    textPt: `Voce tem ${extraMessages + runs.length} respostas seguidas em ${runs.length} ${runs.length === 1 ? 'trecho' : 'trechos'} da conversa. Cada mensagem de service vira cobrada em 01/10/2026: juntando cada sequencia em uma mensagem so voce deixa de pagar ${extraMessages} ${extraMessages === 1 ? 'cobranca' : 'cobrancas'}, ${money.pt} por conversa. Vale a partir da 1.001a mensagem de service do mes: abaixo disso a franquia ja cobre.`,
    textEn: `You send ${extraMessages + runs.length} back-to-back replies across ${runs.length} ${runs.length === 1 ? 'stretch' : 'stretches'} of the conversation. Every service message becomes billable on 2026-10-01: merging each stretch into one message drops ${extraMessages} ${extraMessages === 1 ? 'charge' : 'charges'}, ${money.en} per conversation. This bites from the 1,001st service message of the month onward; below that the allowance already covers you.`,
    savingMicros,
  });
};

/**
 * T2 — a utility template billed outside a window that an earlier reply would have kept
 * open. Only actionable while the in-window exemption still exists.
 */
export const reorderIntoWindow: TipRule = (ctx) => {
  if (!ctx.ruleSet.utilityFreeInCSW) return null;

  const offending = ctx.priced.decisions.filter(
    (d) => d.reasonCode === 'BILLABLE_UTILITY_TEMPLATE' && d.windowState.cswOpenUntil !== null,
  );
  if (offending.length === 0) return null;

  const savingMicros = offending.reduce((sum, d) => sum + d.amountMicros, 0);
  const money = both(savingMicros, ctx.currency);

  return tip({
    ruleId: 'T2',
    severity: 'saving',
    triggeredBy: offending.map((d) => d.messageId),
    currency: ctx.currency,
    titlePt: 'Reordene para dentro da janela',
    titleEn: 'Reorder into the window',
    textPt: `${offending.length} template${offending.length === 1 ? '' : 's'} utility ${offending.length === 1 ? 'saiu' : 'sairam'} depois que a janela de 24h do usuario fechou. Responder ainda dentro da janela zera esse custo ate 30/09/2026: ${money.pt} por conversa.`,
    textEn: `${offending.length} utility template${offending.length === 1 ? '' : 's'} went out after the customer's 24h window closed. Answering inside the window zeroes that cost until 2026-09-30: ${money.en} per conversation.`,
    savingMicros,
  });
};

/** T3 — a marketing template whose copy reads transactional. */
export const suspectedMiscategory: TipRule = (ctx) => {
  const suspects = ctx.sorted.filter(
    (m) => m.kind === 'template' && m.category === 'marketing' && looksTransactional(m.bodyPreview),
  );
  if (suspects.length === 0) return null;

  const billed = suspects.filter((m) => ctx.priced.byMessageId[m.id]?.billable);
  if (billed.length === 0) return null;

  const delta = ctx.rateCard.rates.marketing - ctx.rateCard.rates.utility;
  const savingMicros = toMicros(delta) * billed.length;
  const money = both(savingMicros, ctx.currency);
  const marketing = both(toMicros(ctx.rateCard.rates.marketing), ctx.currency);
  const utility = both(toMicros(ctx.rateCard.rates.utility), ctx.currency);

  return tip({
    ruleId: 'T3',
    severity: 'saving',
    triggeredBy: billed.map((m) => m.id),
    currency: ctx.currency,
    titlePt: 'Revise a categoria do template',
    titleEn: 'Review the template category',
    textPt: `O conteudo de ${billed.length} template${billed.length === 1 ? '' : 's'} de marketing parece transacional. Marketing custa ${marketing.pt} contra ${utility.pt} de utility: reclassificar economizaria ${money.pt}. A classificacao final e da Meta, entao trate isso como hipotese a validar.`,
    textEn: `${billed.length} marketing template${billed.length === 1 ? '' : 's'} read${billed.length === 1 ? 's' : ''} as transactional. Marketing costs ${marketing.en} against ${utility.en} for utility, so reclassifying would save ${money.en}. Meta makes the final call, so treat this as a hypothesis to validate.`,
    savingMicros,
  });
};

/** T4 — paid acquisition without a Click-to-WhatsApp entry point. */
export const useFreeEntryPoint: TipRule = (ctx) => {
  const hasFep = ctx.priced.decisions.some((d) => d.windowState.fepActive);
  if (hasFep) return null;
  if (ctx.priced.totalMicros === 0) return null;

  const savingMicros = ctx.priced.totalMicros;
  const money = both(savingMicros, ctx.currency);

  return tip({
    ruleId: 'T4',
    severity: 'saving',
    triggeredBy: ctx.priced.decisions.filter((d) => d.billable).map((d) => d.messageId),
    currency: ctx.currency,
    titlePt: 'Traga o trafego por Click-to-WhatsApp',
    titleEn: 'Bring traffic in through Click-to-WhatsApp',
    textPt: `Esta conversa comeca sem free entry point. Anuncios Click-to-WhatsApp e CTAs de Pagina abrem 72h em que tudo e gratis, templates inclusive. Se o cliente tivesse chegado por ali, esta conversa custaria ${both(0, ctx.currency).pt} em vez de ${money.pt}.`,
    textEn: `This conversation starts with no free entry point. Click-to-WhatsApp ads and Page CTAs open a 72h window where everything is free, templates included. Had the customer arrived that way, this conversation would cost ${both(0, ctx.currency).en} instead of ${money.en}.`,
    savingMicros,
  });
};

/** T5 — a multi-turn question-and-answer collection that a Flow or buttons would replace. */
export const collectWithFlows: TipRule = (ctx) => {
  const questions = ctx.sorted.filter(
    (m) =>
      m.direction === 'business_to_user' &&
      m.kind === 'non_template' &&
      (m.bodyPreview?.includes('?') ?? false),
  );
  if (questions.length < 3) return null;

  const serviceRate = ctx.rateCard.rates.utility;
  const savingMicros = toMicros(serviceRate) * (questions.length - 1);
  const money = both(savingMicros, ctx.currency);

  return tip({
    ruleId: 'T5',
    severity: 'saving',
    triggeredBy: questions.map((m) => m.id),
    currency: ctx.currency,
    titlePt: 'Colete os dados em uma interacao',
    titleEn: 'Collect the data in one interaction',
    textPt: `O bot faz ${questions.length} perguntas soltas para coletar dados. Um WhatsApp Flow ou uma lista de botoes coleta tudo em 1 interacao em vez de ${questions.length} mensagens cobradas a partir de 01/10/2026: ${money.pt} por conversa, contando da 1.001a mensagem de service do mes em diante.`,
    textEn: `The bot asks ${questions.length} separate questions to collect data. A WhatsApp Flow or a button list collects it in one interaction instead of ${questions.length} messages that become billable on 2026-10-01: ${money.en} per conversation, counting from the 1,001st service message of the month onward.`,
    savingMicros,
  });
};

/**
 * T6 — projected monthly volume sitting just below the next discount tier.
 *
 * This rule states no saving, and that is deliberate. Volume tiers are graduated: crossing
 * a threshold discounts the messages *above* it, never the volume already sent. An earlier
 * version multiplied the rate delta by the whole monthly volume and claimed R$ 408 where
 * the real effect on the next 10,000 messages is R$ 17 — a 24x overstatement. The spec's
 * own wording ("your average falls from R$ 0.0350 to R$ 0.0315") carries the same mistake.
 */
export const nearNextTier: TipRule = (ctx) => {
  const perMonth = ctx.conversationsPerMonth ?? 0;
  if (perMonth <= 0) return null;

  for (const category of ['utility', 'authentication'] as const) {
    const perConversation = ctx.priced.decisions.filter((d) => d.billable && d.category === category).length;
    const volume = perConversation * perMonth;
    if (volume <= 0) continue;

    const next = distanceToNextTier(ctx.rateCard, category, volume);
    if (!next) continue;
    // "Close" means within 10% of the threshold, the way the spec frames it.
    if (next.messagesAway > next.nextTier.from * 0.1) continue;

    const current = both(toMicros(next.currentRate), ctx.currency);
    const discounted = both(toMicros(next.nextTier.rate), ctx.currency);
    const perMessage = both(toMicros(next.currentRate) - toMicros(next.nextTier.rate), ctx.currency);

    return tip({
      ruleId: 'T6',
      severity: 'info',
      triggeredBy: [],
      currency: ctx.currency,
      titlePt: `Faltam ${next.messagesAway.toLocaleString('pt-BR')} mensagens ${category} para o tier -${next.nextTier.discountPct}%`,
      titleEn: `${next.messagesAway.toLocaleString('en-US')} ${category} messages from the -${next.nextTier.discountPct}% tier`,
      textPt: `Sua projecao e de ${volume.toLocaleString('pt-BR')} mensagens ${category} por mes, e o tier -${next.nextTier.discountPct}% comeca em ${next.nextTier.from.toLocaleString('pt-BR')}. O desconto e graduado: as mensagens acima desse limite custam ${discounted.pt} em vez de ${current.pt}, ${perMessage.pt} a menos cada, e as que voce ja enviou continuam pelo rate atual. Cruzar o limite nao barateia o volume inteiro.`,
      textEn: `You project ${volume.toLocaleString('en-US')} ${category} messages a month, and the -${next.nextTier.discountPct}% tier starts at ${next.nextTier.from.toLocaleString('en-US')}. The discount is graduated: messages above that line cost ${discounted.en} instead of ${current.en}, ${perMessage.en} less each, while the ones you already sent stay at the current rate. Crossing the line does not make the whole volume cheaper.`,
      savingMicros: 0,
    });
  }
  return null;
};

/** T7 — failed messages: no charge, but a quality-rating problem. */
export const failedMessages: TipRule = (ctx) => {
  const failed = ctx.sorted.filter((m) => m.status === 'failed');
  if (failed.length === 0) return null;

  return tip({
    ruleId: 'T7',
    severity: 'risk',
    triggeredBy: failed.map((m) => m.id),
    currency: ctx.currency,
    titlePt: 'Falhas de entrega derrubam seu quality rating',
    titleEn: 'Delivery failures hurt your quality rating',
    textPt: `${failed.length} mensagem${failed.length === 1 ? '' : 's'} falhou na entrega. Falha nao gera cobranca, mas derruba o quality rating do numero e pode reduzir seus limites de envio. Revise opt-in, numero do destinatario e qualidade do template.`,
    textEn: `${failed.length} message${failed.length === 1 ? '' : 's'} failed to deliver. A failure is not charged, but it does drag down the number's quality rating and can cut your messaging limits. Check opt-in, the recipient number and template quality.`,
    savingMicros: 0,
  });
};

/** T8 — projected service volume past the 1,000-per-number monthly allowance. */
export const serviceAllowanceBlown: TipRule = (ctx) => {
  const perMonth = ctx.conversationsPerMonth ?? 0;
  if (perMonth <= 0) return null;

  // The allowance only exists in the October ruleset, so the future run is what counts.
  const servicePerConversation = ctx.future.decisions.filter((d) => d.billable && d.category === 'service').length;
  const projected = servicePerConversation * perMonth;
  const allowance = 1_000 * Math.max(1, Math.floor(ctx.phoneNumbers ?? 1));
  if (projected <= allowance) return null;

  const excess = projected - allowance;
  const savingMicros = toMicros(ctx.rateCard.rates.utility) * excess;
  const money = both(savingMicros, ctx.currency);

  return tip({
    ruleId: 'T8',
    severity: 'risk',
    triggeredBy: ctx.future.decisions.filter((d) => d.billable && d.category === 'service').map((d) => d.messageId),
    currency: ctx.currency,
    titlePt: 'Sua franquia de service messages estoura',
    titleEn: 'Your service message allowance runs out',
    textPt: `No ruleset de 01/10/2026 voce projeta ${projected.toLocaleString('pt-BR')} mensagens de service por mes contra uma franquia de ${allowance.toLocaleString('pt-BR')}. As ${excess.toLocaleString('pt-BR')} excedentes custam ${money.pt} por mes. Consolide respostas ou mova o que for transacional para templates utility.`,
    textEn: `Under the 2026-10-01 ruleset you project ${projected.toLocaleString('en-US')} service messages a month against an allowance of ${allowance.toLocaleString('en-US')}. The ${excess.toLocaleString('en-US')} over the line cost ${money.en} a month. Consolidate replies, or move the transactional ones to utility templates.`,
    savingMicros,
  });
};

/** T9 — a long support thread: reframe the metric as cost per resolution. */
export const costPerResolution: TipRule = (ctx) => {
  const businessMessages = ctx.sorted.filter((m) => m.direction === 'business_to_user').length;
  const customerMessages = ctx.sorted.filter((m) => m.direction === 'user_to_business').length;
  if (businessMessages < 4 || customerMessages < 2) return null;

  const today = both(ctx.priced.totalMicros, ctx.currency);
  const future = both(ctx.future.totalMicros, ctx.currency);

  return tip({
    ruleId: 'T9',
    severity: 'info',
    triggeredBy: [],
    currency: ctx.currency,
    titlePt: 'Meca custo por conversa resolvida',
    titleEn: 'Measure cost per resolved conversation',
    textPt: `Esta conversa tem ${ctx.sorted.length} mensagens e custa ${today.pt} hoje, ${future.pt} a partir de 01/10/2026. Em suporte, o numero que importa nao e custo por mensagem: e quanto custa resolver um caso. Use este valor como a sua linha de base.`,
    textEn: `This conversation runs ${ctx.sorted.length} messages and costs ${today.en} today, ${future.en} from 2026-10-01. In support the number that matters is not cost per message, it is cost per resolved case. Use this as your baseline.`,
    savingMicros: 0,
  });
};

/** T10 — the October comparison, whenever the two rulesets disagree. */
export const compareWithOctober: TipRule = (ctx) => {
  const deltaMicros = ctx.future.totalMicros - ctx.priced.totalMicros;
  if (deltaMicros <= 0) return null;

  const today = both(ctx.priced.totalMicros, ctx.currency);
  const future = both(ctx.future.totalMicros, ctx.currency);
  const delta = both(deltaMicros, ctx.currency);
  const factor = ctx.priced.totalMicros === 0 ? null : ctx.future.totalMicros / ctx.priced.totalMicros;
  const factorPt = factor === null ? '' : ` (${factor.toFixed(2).replace('.', ',')}x)`;
  const factorEn = factor === null ? '' : ` (${factor.toFixed(2)}x)`;

  return tip({
    ruleId: 'T10',
    severity: 'info',
    triggeredBy: ctx.future.decisions
      .filter((d) => d.billable && !ctx.priced.byMessageId[d.messageId]?.billable)
      .map((d) => d.messageId),
    currency: ctx.currency,
    titlePt: 'Simule o mesmo fluxo em 01/10/2026',
    titleEn: 'Run the same flow under the 2026-10-01 rules',
    textPt: `Quando service e utility dentro da janela virarem cobrados, esta conversa passa de ${today.pt} para ${future.pt}${factorPt}: ${delta.pt} a mais por conversa.`,
    textEn: `Once service and in-window utility become billable, this conversation goes from ${today.en} to ${future.en}${factorEn}: ${delta.en} more per conversation.`,
    savingMicros: deltaMicros,
  });
};

/** The catalogue, in the order tips are shown when savings tie. */
export const TIP_RULES: readonly TipRule[] = Object.freeze([
  consolidateReplies,
  reorderIntoWindow,
  suspectedMiscategory,
  useFreeEntryPoint,
  collectWithFlows,
  nearNextTier,
  failedMessages,
  serviceAllowanceBlown,
  costPerResolution,
  compareWithOctober,
]);
