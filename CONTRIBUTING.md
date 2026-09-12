# Contribuindo

A contribuição mais valiosa aqui é **rate card com fonte**. A interface qualquer um copia;
o que cria confiança é o histórico de regras versionado, testado e explicável.

## Contribuindo um rate card

Na maioria dos casos você **não precisa digitar número nenhum**. A Meta serve os rates e os
limites de volume por um endpoint público, o mesmo que a calculadora oficial consome, e o
script puxa de lá:

```bash
node scripts/fetch-rate-card.mjs --market MX --currency MXN --effective-from 2026-07-01
```

Depois disso:

1. Registre o arquivo em `packages/pricing-data/src/loader.ts` (uma linha em `RATE_CARDS`).
2. Se o mercado for novo, adicione nome e código de país em `MARKET_NAMES` e
   `CALLING_CODES` no script.
3. Rode `pnpm test`. Os testes de dados checam que os tiers são contíguos, ordenados,
   abertos no topo e coerentes com os percentuais de desconto declarados.

Para conferir se o que está versionado ainda bate com o que a Meta publica hoje:

```bash
node scripts/fetch-rate-card.mjs --market BR --currency BRL --check
```

Se precisar preencher a mao, num mercado que o endpoint não cubra, use `sourceUrl` com a
**fonte primária** e marque `ratesVerified`/`tiersVerified` como `true` apenas se você
conferiu cada número nela. README de terceiro serve para achar o número, nunca para citá-lo.

Um detalhe que o script trata e que é fácil errar a mão: a Meta publica faixas inclusivas
(`1..250000`, `250001..2000000`), e o motor trabalha com posições semiabertas, onde a
primeira mensagem cobrada do mês esta na posicao 0. Um `min_volume` de 250001 vira um
limite inferior exclusivo de 250000.

Se um card antigo sai de vigência, preencha o `effectiveTo` dele em vez de apagar o arquivo:
o "rules as of" do simulador precisa conseguir voltar no tempo.

O repositório inteiro é MIT, rate cards inclusive. Na prática os rates são fatos publicados
pela Meta e fato não é protegido por direito autoral na maioria das jurisdicoes, então use
os JSON a vontade, inclusive fora deste projeto. O trabalho que pedimos que você preserve
e a atribuição da *fonte* (`sourceUrl`), não a nossa.

### Por que os campos `*Verified` existem

Um número sem fonte é um chute com cara de dado. `assertReleaseReady()` lanca erro enquanto
qualquer `ratesVerified`/`tiersVerified`/`verified` estiver `false`, e há um teste que
garante isso. Flipar a flag sem preencher o número real é exatamente o que ela existe para
pegar.

## Contribuindo uma regra

Regra nova vira um **ruleset novo** com vigência própria em
`packages/pricing-data/data/rulesets/`, nunca um `if` de data dentro do motor. Se a regra
não couber nos campos existentes do `RuleSet`, adicione o campo ao tipo e a todos os
rulesets. Deixar um ruleset sem o campo torna o comportamento dependente da ordem dos
arquivos.

Toda decisão de preço precisa de um `reasonCode` com texto em PT e EN
(`packages/pricing-engine/src/reason-codes.ts`).

## Contribuindo uma dica

As dicas vivem em `packages/tips-engine/src/rules/catalogue.ts`. Cada uma é uma função pura
que recebe a conversa precificada e devolve `Tip | null`. Requisitos:

- `triggeredBy` só com ids de mensagem que existem na conversa (tem teste).
- Texto nos dois idiomas, com a economia estimada em dinheiro e não em percentual.
- Nada de conselho que a gente não consiga quantificar: se não da para estimar a economia,
  a dica é `severity: 'info'` com `savingMicros: 0`.

## Convencoes de código

**Imports relativos não levam extensao.** Escreva `from './types'`, nunca `from './types.js'`.
O monorepo distribui código TypeScript em vez de build, e o app web consome esse código
direto pelo webpack do Next via `transpilePackages`. O webpack não remapeia `./types.js`
para `types.ts` como o vitest, o tsx e a resolução `Bundler` do tsc fazem, então um sufixo
`.js` passa no teste e no typecheck e quebra só no `pnpm build:web`. Há um teste que pega
isso (`module-specifiers.test.ts`).

## Regerando o GIF do README

Os quadros são montados a partir de estado codificado na URL, não de uma gravação de tela,
então o mesmo commit sempre produz o mesmo GIF e mudança de UI é um comando:

```bash
pnpm build:web && node scripts/capture-readme-gif.mjs
```

O script sobe um servidor estático próprio e dirige o Chrome instalado na máquina via
playwright-core, sem baixar browser.

## Rodando

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev:web
```

### Se o repo estiver dentro de uma pasta sincronizada (Google Drive, Dropbox, iCloud)

Opcional, e só afeta a sua máquina: apontar `node_modules` para o disco local deixa o
`pnpm install` cerca de 8x mais rapido, porque a pasta sincronizada tenta subir para a
nuvem cada um dos milhares de arquivos.

```bash
LOCAL="$HOME/.pnpm-node-modules/dyvit-whatsapp-simulator/node_modules"
rm -rf node_modules && mkdir -p "$LOCAL" && ln -s "$LOCAL" node_modules
pnpm install
```

O caminho de destino **precisa terminar em `node_modules`**. O `require-hook` do Next
resolve pelo realpath, então um alvo com outro nome faz o `next build` quebrar com
`Cannot find module 'styled-jsx/package.json'` — o vitest e o tsc não quebram, porque
usam resolvers que preservam o symlink.

Para desfazer: `rm node_modules && pnpm install`.

## Calendario de preços

A Meta só muda preço em 01/01, 01/04, 01/07 e 01/10, com aviso mínimo de 1 mês para rate
card, 3 meses para add-on de modelo e 6 meses para mudança de modelo. O workflow de CI
`rate-card-freshness` roda a checagem dos dados para que um ruleset prestes a expirar
apareca antes de expirar.
