# WhatsApp Messaging Simulator

[![CI](https://github.com/fabianocruz/whatsapp-simulator/actions/workflows/ci.yml/badge.svg)](https://github.com/fabianocruz/whatsapp-simulator/actions/workflows/ci.yml)
[![Licença: MIT](https://img.shields.io/badge/licen%C3%A7a-MIT-0A6E4A)](./LICENSE)
[![Rate card](https://img.shields.io/badge/rate%20card%20BR-conferido%20em%2012%2F09%2F2026-0A6E4A)](./packages/pricing-data/data/rate-cards/br-BRL/2026-07-01.json)

**Monte a conversa. Veja o custo. Pague menos.**

Ambiente de desenvolvimento *cost-aware* para a WhatsApp Business Platform: você monta uma
conversa ponta a ponta num frame de telefone e vê, mensagem a mensagem, quanto ela custaria
nas regras da Meta, com o motivo de cada cobrança e dicas de otimização.

> Simulação educacional. Não enviamos mensagens reais e a cobrança oficial é a da Meta.
> Impostos brasileiros podem incidir sobre os valores mostrados.

![O simulador montando a conversa do exemplo da spec, com o custo por mensagem aparecendo e o comparativo de 01/10/2026 no final](docs/simulator.gif)

<sub>Regerar após mudança de UI: `pnpm build:web && node scripts/capture-readme-gif.mjs`</sub>

## Por que

O modelo de preços da Meta virou *per-message* em 01/07/2025, muda de novo em 01/10/2026
(mensagens de service passam a ser cobradas, utility dentro da janela volta a ser cobrado) e
o Brasil ganhou rate card próprio em BRL em 01/07/2026. Não existe simulador oficial: os
test numbers da Meta não calculam custo e os BSPs mostram o próprio markup, não a regra pura.

## O que tem aqui

| Pacote | O que é |
|---|---|
| `@dyvit/whatsapp-pricing` | Motor de preço deterministico: janelas CSW/FEP, tiers, franquia, reason codes |
| `@dyvit/whatsapp-pricing-data` | Rate cards e rulesets versionados por vigência, como dados abertos |
| `@dyvit/whatsapp-tips` | 10 regras de otimização com estimativa de economia |
| `@dyvit/whatsapp-scenarios` | Cenarios prontos (exemplo da spec, FEP, suporte longo, OTP) |
| `@dyvit/whatsapp-simulator-cli` | `dyvit-wa-sim`: precifica um cenário e roda um emulador local da Cloud API |
| `apps/web` | O simulador: phone frame, taximetro, dicas, share por URL, export CSV/JSON |

## Comecando

```bash
pnpm install
pnpm test          # suite completa, incluindo os golden tests de custo
pnpm dev:web       # simulador em http://localhost:3000
```

### CLI

```bash
pnpm cli -- price --scenario worked-example-spec --compare
pnpm cli -- price --file meu-cenário.json --per-month 30000 --csv breakdown.csv
pnpm cli -- scenarios
```

### Ver seu app rodando no telefone

O loop que a spec chama de gate de release: troque a base URL, mande o que você já manda,
e veja o mesmo fluxo no telefone com o preço de cada mensagem.

```bash
pnpm cli -- serve                      # terminal 1: o emulador, em 127.0.0.1:4290
pnpm dev:web                           # terminal 2: o simulador, em localhost:3000
node examples/app-cobranca/index.mjs   # terminal 3: uma régua de cobrança de exemplo
```

No simulador, ligue **Ao vivo** e aponte para `http://127.0.0.1:4290`. As mensagens do app
aparecem no telefone conforme são enviadas, cada uma com o chip de preço e o motivo.

Conectar antes de rodar o app é mais bonito de ver, mas não é obrigatório: o emulador
reenvia o estado da conversa a quem conecta, então ligar o Ao vivo depois mostra tudo que
já aconteceu.

O que observar enquanto roda: o primeiro template sai fora da janela e custa R$ 0,0350; a
resposta do cliente abre a CSW, e o marcador aparece no chat; daí em diante tudo sai
grátis; o salto de 48h fecha a janela, e o último template volta a ser cobrado. No fim,
R$ 0,0700 e 2 de 9 mensagens cobradas.

O app de exemplo é um arquivo só, sem dependências, em
[`examples/app-cobranca`](./examples/app-cobranca/index.mjs): template fora da janela,
lista de parcelamento, Flow de confirmação, texto livre e documento. Troque a base URL dele
pelo seu app quando quiser.

O emulador tem um relógio próprio, e isso importa: uma régua de cobrança acontece ao longo
de dias, mas o script roda em segundos. Sem avançar o relógio, tudo cai no mesmo minuto e a
janela de 24h nunca fecha, que é justamente o que decide o preço.

```bash
curl -X POST http://127.0.0.1:4290/_sim/clock \
  -H 'content-type: application/json' -d '{"advance_hours": 26}'
```

Abrir `http://127.0.0.1:4290` no navegador lista todas as rotas do emulador.

Quem controla o tempo é o emulador, não o seu app: ele continua mandando o que já manda.

Uma observação sobre a porta: o padrão é **4290**, e não 4190, porque a lista de portas
bloqueadas do padrão Fetch inclui a 4190. Navegadores e o `fetch` do Node recusam conectar
nela com `bad port`.

### Emulador local da Cloud API

Troque a base URL do seu projeto para `http://127.0.0.1:4290/v22.0` e mande os mesmos
payloads de sempre. O emulador responde com o mesmo shape da Cloud API, dispara os webhooks
de status assinados e mostra a decisão de preço de cada mensagem.

```bash
pnpm cli -- serve --webhook http://localhost:3000/webhooks/whatsapp --app-secret dev
curl -X POST http://127.0.0.1:4290/v22.0/109876543210/messages \
  -H 'content-type: application/json' \
  -d '{"messaging_product":"whatsapp","to":"+5511999999999","type":"template",
       "template":{"name":"promo","category":"marketing"}}'
curl 'http://127.0.0.1:4290/_sim/state'
```

Ele também recusa o que a Meta recusaria: fora da janela de 24h, uma mensagem que não é
template volta `400` com o erro `131047` e não entra na conversa — só template passa. É a
regra que decide se um agente de cobrança pode falar quando o pagamento entra três dias
depois, e ela só vale como teste se o emulador negar igual.

| Rota | O que faz |
|---|---|
| `POST /v{versão}/{phone-number-id}/messages` | Envio, no shape da Cloud API |
| `POST /_sim/inbound` | Simula uma mensagem do cliente (aceita `entry_point`) |
| `GET /_sim/state` | Timeline precificada até agora |
| `GET /_sim/webhooks` | Webhooks que foram (ou seriam) entregues |
| `POST /_sim/webhooks/{índice}/redeliver` | Entrega de novo aquele webhook |
| `POST /_sim/replay` | Reentrega vários, na ordem pedida: `{"indexes": [2, 1, 1]}` |

### Usando só o motor de preço

```ts
import { priceConversation, projectMonthly } from '@dyvit/whatsapp-pricing';

const priced = priceConversation(messages, { asOf: '2026-09-01', market: 'BR', currency: 'BRL' });
console.log(priced.total);                       // 0.3567
console.log(priced.decisions[0].reasonCode);     // 'BILLABLE_MARKETING_TEMPLATE'
console.log(priced.decisions[0].explanation.pt); // por que cobrou
```

Todo preço volta com um trace: ruleset, regra, janela, rate, tier, reason code e a fonte.

## As regras, em uma tela

- Mensagem do usuário nunca cobra e abre/renova a janela de atendimento (CSW) de 24h.
- Cobrança acontece na entrega: `delivered` e `read` cobram, `sent` e `failed` não.
- Template marketing cobra sempre. Authentication cobra sempre. Utility cobra fora da CSW
  (e, a partir de 01/10/2026, também dentro dela).
- Non-template só existe dentro da CSW. Grátis até 30/09/2026; depois disso cobrado ao rate
  de utility, com franquia de 1.000/mês por número.
- Free entry point: cliente chegando por anuncio Click-to-WhatsApp ou CTA de Pagina, com
  resposta do negócio em até 24h, abre 72h em que tudo é grátis. Independe da CSW.
- Tiers de volume valem para utility e authentication, por par mercado–categoria, sobre o
  volume mensal de mensagens cobradas, com reset mensal.

## Precisão dos dados

Rates e limites de volume vêm da **fonte primária da Meta**: o endpoint público que a
própria calculadora oficial de pricing consome. `scripts/fetch-rate-card.mjs` regenera o
rate card a partir dele, e `--check` falha se o que está versionado divergir do que a Meta
pública hoje.

```bash
node scripts/fetch-rate-card.mjs --market BR --currency BRL --check
```

Todo número sem fonte fica marcado no JSON (`ratesVerified`, `tiersVerified`), vira aviso
no CLI e na interface, e `assertReleaseReady()` falha enquanto existir. Hoje o dataset
passa nessa checagem. Cada arquivo carrega um `verifiedAt` com a data da última conferência
contra a fonte, e o CI roda o `--check` para pegar mudança no dia em que ela sai. Ver
[CONTRIBUTING.md](./CONTRIBUTING.md).

Uma ressalva que o dado não cobre: impostos brasileiros podem incidir sobre estes valores,
e o rate card da Meta não os inclui.

## Desvios da spec de engenharia v2

Três pontos em que o código não segue a spec ao pe da letra, todos deliberados:

| Spec | Código | Por que |
|---|---|---|
| "cobrança só em `delivered` (sent/`read` sem delivered: não cobra)" | `delivered` e `read` cobram | `SimMessage` carrega um status terminal único, não um histórico. Mensagem lida foi necessariamente entregue, então tratar `read` como não cobrado deixaria toda mensagem lida grátis, que não é como a Meta cobra. Modelar histórico de status (`deliveredAt`/`readAt`) é o caminho certo quando o emulador passar a fazer replay de webhook real. |
| `PriceDecision.chargeBRL: number` | `amount` + `currency` + `amountMicros` | A própria spec suporta USD (seletor de moeda na barra superior, `RateCard.currency: "BRL" \| "USD"`), então um campo com a moeda no nome se contradiz. `amountMicros` existe porque a soma acontece em inteiros. |
| (sem equivalente) | Tiers e franquia de 1.000 service messages ficam fora do custo por conversa por padrão | Não é desvio, é a leitura que torna a spec consistente: o `R$ 0,4267` do acceptance criteria #1 só fecha se a franquia não se aplicar na conversa, e a seção 6.4 diz exatamente isso. Quem quiser a conversa precificada como a N-ésima do mês passa `monthlyContext` explicitamente. |

## Não-objetivos

Não envia mensagem real, não é um BSP, não aprova nem classifica templates (isso é da Meta),
não replica markup de BSP e não é ferramenta de billing. WhatsApp Business Calling API e
MM Lite ficam fora por enquanto.

## Licença

MIT. Veja [LICENSE](./LICENSE).
