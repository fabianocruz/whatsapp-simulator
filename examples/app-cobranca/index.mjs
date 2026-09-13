#!/usr/bin/env node
/**
 * Um app de cobrança de mentira, para o simulador ter o que mostrar.
 *
 * Ele faz o que qualquer aplicação sobre a Cloud API faz: manda template, espera o
 * cliente responder, oferece opções, fecha acordo. A única diferença é a base URL, que
 * aponta para o emulador local em vez do Graph da Meta.
 *
 * É esse o loop que a spec chama de gate de release: trocar a URL, mandar o que você já
 * manda, e ver o mesmo fluxo no telefone com o preço de cada mensagem.
 *
 *   Terminal 1:  pnpm cli -- serve --port 4290
 *   Terminal 2:  node examples/app-cobranca/index.mjs
 *   Navegador:   pnpm dev:web, e liga o "Ao vivo"
 */

import { parseArgs } from 'node:util';

const { values } = parseArgs({
  options: {
    base: { type: 'string', default: 'http://127.0.0.1:4290/v22.0' },
    'phone-number-id': { type: 'string', default: '109876543210' },
    to: { type: 'string', default: '+5511988887777' },
    /** Pausa entre mensagens, para dar tempo de acompanhar no telefone. */
    delay: { type: 'string', default: '1800' },
  },
});

const BASE = values.base.replace(/\/$/, '');
const SIM = BASE.replace(/\/v\d+\.\d+$/, '');
const PHONE_NUMBER_ID = values['phone-number-id'];
const TO = values.to;
const DELAY = Number(values.delay);

const pausa = (ms = DELAY) => new Promise((r) => setTimeout(r, ms));

async function enviar(payload, rotulo) {
  const response = await fetch(`${BASE}/${PHONE_NUMBER_ID}/messages`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer TOKEN_DE_MENTIRA' },
    body: JSON.stringify({ messaging_product: 'whatsapp', to: TO, ...payload }),
  });
  const body = await response.json();
  if (!response.ok) {
    console.error(`  ✗ ${rotulo}: ${body?.error?.message ?? response.status}`);
    return null;
  }
  console.log(`  → ${rotulo}`);
  return body.messages?.[0]?.id ?? null;
}

/** O cliente respondendo. Num app de verdade isso chega pelo webhook. */
async function clienteResponde(texto, entryPoint = 'organic') {
  await fetch(`${SIM}/_sim/inbound`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone_number_id: PHONE_NUMBER_ID, from: TO, text: texto, entry_point: entryPoint }),
  });
  console.log(`  ← ${texto}`);
}

async function main() {
  const saude = await fetch(`${SIM}/health`).catch(() => null);
  if (!saude?.ok) {
    console.error(`Não achei o emulador em ${SIM}. Suba com: pnpm cli -- serve --port 4290`);
    process.exitCode = 1;
    return;
  }

  console.log(`Régua de cobrança contra ${BASE}\n`);

  // Fora de qualquer janela: só template sai, e marketing é o mais caro que existe.
  await enviar(
    {
      type: 'template',
      template: {
        name: 'lembrete_fatura',
        category: 'utility',
        language: { code: 'pt_BR' },
        components: [
          { type: 'header', parameters: [{ type: 'text', text: 'Sua fatura venceu' }] },
          { type: 'body', parameters: [{ type: 'text', text: 'Oi Ana! A fatura de setembro, R$ 348,90, venceu ontem. Quer resolver agora?' }] },
          { type: 'footer', parameters: [{ type: 'text', text: 'Dyvit · cobrança sem atrito' }] },
          { type: 'button', sub_type: 'quick_reply', index: '0', parameters: [{ type: 'text', text: 'Quero resolver' }] },
          { type: 'button', sub_type: 'quick_reply', index: '1', parameters: [{ type: 'text', text: 'Já paguei' }] },
        ],
      },
    },
    'template utility, fora da janela',
  );
  await pausa();

  // A resposta do cliente abre a janela de 24h: daqui em diante sai texto livre.
  await clienteResponde('Quero resolver');
  await pausa(900);

  await enviar(
    {
      type: 'interactive',
      interactive: {
        type: 'list',
        header: { type: 'text', text: 'Formas de pagamento' },
        body: { text: 'Posso dividir em até 6x. Escolha o que couber no seu mês.' },
        footer: { text: 'Sem juros até 3x' },
        action: {
          button: 'Ver opções',
          sections: [
            {
              title: 'Sem juros',
              rows: [
                { id: 'vista', title: 'À vista · R$ 331,45', description: '5% de desconto' },
                { id: '3x', title: '3x de R$ 116,30', description: 'Primeira em 05/10' },
              ],
            },
            { title: 'Com juros', rows: [{ id: '6x', title: '6x de R$ 62,80', description: 'Total R$ 376,80' }] },
          ],
        },
      },
    },
    'lista de parcelamento',
  );
  await pausa();

  await clienteResponde('3x');
  await pausa(900);

  await enviar(
    {
      type: 'interactive',
      interactive: {
        type: 'flow',
        body: { text: 'Falta confirmar seus dados para eu gerar o acordo.' },
        footer: { text: 'Leva menos de 1 minuto' },
        action: { name: 'flow', parameters: { flow_cta: 'Confirmar dados', flow_name: 'confirmacao_acordo' } },
      },
    },
    'Flow de confirmação',
  );
  await pausa();

  await clienteResponde('Confirmado');
  await pausa(900);

  await enviar({ type: 'text', text: { body: 'Perfeito! Gerando seu acordo…' } }, 'texto livre, dentro da janela');
  await pausa(1200);

  await enviar(
    { type: 'document', document: { filename: 'acordo-4812.pdf' } },
    'documento do acordo',
  );
  await pausa();

  // Dois dias depois: a janela já fechou, então volta a exigir template.
  await enviar(
    {
      type: 'template',
      template: {
        name: 'lembrete_parcela',
        category: 'utility',
        language: { code: 'pt_BR' },
        components: [
          { type: 'body', parameters: [{ type: 'text', text: 'Sua primeira parcela de R$ 116,30 vence em 3 dias.' }] },
          { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: 'Pagar agora' }] },
        ],
      },
    },
    'template utility, janela fechada',
  );

  const estado = await (await fetch(`${SIM}/_sim/state?key=${encodeURIComponent(`${PHONE_NUMBER_ID}:${TO}`)}`)).json();
  const { priced } = estado;
  console.log(`\n${priced.decisions.length} mensagens · ${priced.billableCount} cobradas`);
  console.log(`Custo desta conversa: R$ ${priced.total.toFixed(4)}`);
  for (const linha of priced.breakdown) {
    if (linha.messages > 0) {
      console.log(`  ${linha.category.padEnd(15)} R$ ${linha.amount.toFixed(4)}  (${linha.billableMessages}/${linha.messages})`);
    }
  }
  console.log('\nSimulação educacional. A cobrança oficial é a da Meta.');
}

await main();
