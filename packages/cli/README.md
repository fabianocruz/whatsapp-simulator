# @dyvit/whatsapp-simulator-cli

**Precifique a conversa no terminal. Rode a Cloud API na sua máquina.**

`dyvit-wa-sim` faz duas coisas: calcula quanto uma conversa custaria nas regras da Meta,
mensagem a mensagem e com o motivo de cada cobrança, e sobe um emulador local da WhatsApp
Cloud API para você apontar o seu app e ver o preço de cada envio enquanto ele roda.

> Simulação educacional. Não enviamos mensagens reais e a cobrança oficial é a da Meta.
> Impostos brasileiros podem incidir sobre os valores mostrados.

## Instalando

Não precisa instalar. O binário se chama `dyvit-wa-sim`, e o pacote tem outro nome:

```bash
npx @dyvit/whatsapp-simulator-cli price --scenario worked-example-spec
npx @dyvit/whatsapp-simulator-cli serve
```

Para fixar a versão, `npx @dyvit/whatsapp-simulator-cli@0.2.0 price`. Para ter o comando
sempre à mão, `npm i -g @dyvit/whatsapp-simulator-cli` e depois `dyvit-wa-sim price`.

Se você fixou a **0.1.0**, troque: naquela versão o binário instalado saía sem rodar
comando nenhum e sem imprimir nada. Da 0.1.1 em diante ele funciona.

Pede Node 20.11 ou mais novo. Nenhuma dependência em runtime: o motor de preço, os rate
cards e os cenários vão dentro do binário.

## `price`, o que a conversa custa

```bash
dyvit-wa-sim price --scenario worked-example-spec
dyvit-wa-sim price --file meu-cenario.json --per-month 30000 --csv breakdown.csv
dyvit-wa-sim price --scenario remarcacao-com-flow --compare
dyvit-wa-sim scenarios            # lista os cenários que já vêm no pacote
```

Sai uma tabela por mensagem com categoria, janela, custo e reason code, o total, as dicas
de otimização e, com `--per-month`, a projeção mensal com tiers e franquia:

```
id  quando           categoria  janela      custo  motivo
m1  09-01 10:00  ->  marketing  -       R$ 0,3217  marketing
m2  09-01 12:00  <-  service    CSW             -  grátis · recebida
m3  09-01 13:00  ->  service    CSW             -  grátis · service
m4  09-01 14:00  ->  utility    CSW             -  grátis · dentro da CSW
m5  09-02 16:00  ->  utility    -       R$ 0,0350  utility

Total: R$ 0,3567  ·  2 de 5 mensagens cobradas  ·  ruleset ruleset-2025-07-01
```

`--compare` precifica a mesma timeline também sob o ruleset de 01/10/2026, quando service
passa a ser cobrado e utility dentro da janela volta a ser. `--json` troca a tabela por
saída para máquina, `--as-of` escolhe a data das regras, `--market` e `--currency` o
mercado e a moeda, `--locale en` muda o idioma. `--help` lista tudo.

Um arquivo de cenário é um JSON com `{ "messages": [...] }`, no formato `SimMessage` do
`@dyvit/whatsapp-pricing`.

## `serve`, o emulador da Cloud API

```bash
dyvit-wa-sim serve
dyvit-wa-sim serve --webhook http://localhost:3000/webhooks/whatsapp --app-secret dev
```

Ele escuta em `127.0.0.1:4290`. Troque a base URL do seu projeto de
`https://graph.facebook.com/v22.0` para **`http://127.0.0.1:4290/v22.0`** e mande os mesmos
payloads de sempre: a resposta tem o shape da Cloud API, os webhooks de status saem
assinados com `X-Hub-Signature-256`, e cada mensagem sai no log com o preço e o reason
code. O resto do seu código não muda.

| Rota | O que faz |
|---|---|
| `POST /v{versão}/{phone-number-id}/messages` | Envio, no shape da Cloud API |
| `POST /_sim/inbound` | Simula uma mensagem do cliente (aceita `entry_point`) |
| `POST /_sim/clock` | Move o relógio da conversa: `{"advance_hours": 26}` |
| `GET /_sim/state` | Timeline precificada até agora |
| `GET /_sim/events` | Stream SSE da conversa, usado pelo modo Ao vivo do simulador |
| `GET /_sim/webhooks` | Webhooks que foram, ou seriam, entregues |
| `GET /health` | Status do emulador |

Qualquer versão da Graph serve na rota de envio: `/v22.0`, `/v21.0`, o que o seu SDK já
usa. Abrir `http://127.0.0.1:4290` no navegador lista as rotas.

A porta padrão é **4290**, e não 4190, porque a lista de portas bloqueadas do padrão Fetch
inclui a 4190: navegadores e o `fetch` do Node recusam conectar nela com `bad port`.
`--port` e `--host` mudam isso.

### Um exemplo inteiro

Suba o emulador num terminal e, noutro, mande um template utility, responda como cliente,
pule um dia e leia o estado:

```bash
dyvit-wa-sim serve

curl -X POST http://127.0.0.1:4290/v22.0/109876543210/messages \
  -H 'content-type: application/json' \
  -d '{"messaging_product":"whatsapp","to":"+5511999999999","type":"template",
       "template":{"name":"fatura_disponivel","category":"utility"}}'

curl -X POST http://127.0.0.1:4290/_sim/inbound \
  -H 'content-type: application/json' \
  -d '{"phone_number_id":"109876543210","from":"+5511999999999","text":"oi"}'

curl -X POST http://127.0.0.1:4290/_sim/clock \
  -H 'content-type: application/json' -d '{"advance_hours": 26}'

curl 'http://127.0.0.1:4290/_sim/state'
```

O primeiro template sai fora da janela e custa R$ 0,0350 (`BILLABLE_UTILITY_TEMPLATE`); a
resposta do cliente não custa nada e abre a CSW de 24h (`FREE_INBOUND`); o salto de 26h
fecha essa janela, então o próximo template volta a ser cobrado.

O relógio próprio é o detalhe que faz o emulador valer alguma coisa. Uma régua de cobrança
acontece ao longo de dias, mas o seu script roda em segundos: sem `POST /_sim/clock`, tudo
cai no mesmo minuto e a janela de 24h nunca fecha, que é justamente o que decide o preço.
Quem controla o tempo é o emulador, não o seu app.

É ferramenta de desenvolvimento: sem autenticação, sem persistência, uma conversa por par
de números. Não envia mensagem real.

## O resto do projeto

Este pacote é a ponta de linha de comando. O motor de preço determinístico
(`@dyvit/whatsapp-pricing`), os rate cards versionados com data de conferência contra a
fonte primária da Meta (`@dyvit/whatsapp-pricing-data`), as dicas de otimização
(`@dyvit/whatsapp-tips`) e o simulador web com o phone frame e o taxímetro estão em
[github.com/fabianocruz/whatsapp-simulator](https://github.com/fabianocruz/whatsapp-simulator),
que também explica as regras de cobrança em uma tela.

Ligando o modo **Ao vivo** do simulador para este emulador, as mensagens do seu app
aparecem no telefone conforme são enviadas, cada uma com o chip de preço.

## Licença

MIT.
