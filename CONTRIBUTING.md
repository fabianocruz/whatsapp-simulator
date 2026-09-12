# Contribuindo

A contribuicao mais valiosa aqui e **rate card com fonte**. A interface qualquer um copia;
o que cria confianca e o historico de regras versionado, testado e explicavel.

## Contribuindo um rate card

1. Crie `packages/pricing-data/data/rate-cards/<market>-<CURRENCY>/<YYYY-MM-DD>.json`
   usando `br-BRL/2026-07-01.json` como modelo. O nome do arquivo e a data de vigencia.
2. Preencha `sourceUrl` com a **fonte primaria**: a pagina de pricing da Meta ou o rate
   card oficial. README de terceiro nao serve como fonte: use para achar o numero, nao para
   cita-lo.
3. Marque `ratesVerified: true` **apenas** se voce conferiu cada rate na fonte primaria.
   Mesma regra para `tiersVerified` nos limites de volume.
4. Registre o arquivo em `packages/pricing-data/src/loader.ts` (uma linha em `RATE_CARDS`).
5. Rode `pnpm test`. Os testes de dados checam que os tiers sao contiguos, ordenados,
   abertos no topo e coerentes com os percentuais de desconto declarados.

Se um card antigo sai de vigencia, preencha o `effectiveTo` dele em vez de apagar o arquivo:
o "rules as of" do simulador precisa conseguir voltar no tempo.

O repositorio inteiro e MIT, rate cards inclusive. Na pratica os rates sao fatos publicados
pela Meta e fato nao e protegido por direito autoral na maioria das jurisdicoes, entao use
os JSON a vontade, inclusive fora deste projeto. O trabalho que pedimos que voce preserve
e a atribuicao da *fonte* (`sourceUrl`), nao a nossa.

### Por que os campos `*Verified` existem

Um numero sem fonte e um chute com cara de dado. `assertReleaseReady()` lanca erro enquanto
qualquer `ratesVerified`/`tiersVerified`/`verified` estiver `false`, e ha um teste que
garante isso. Flipar a flag sem preencher o numero real e exatamente o que ela existe para
pegar.

## Contribuindo uma regra

Regra nova vira um **ruleset novo** com vigencia propria em
`packages/pricing-data/data/rulesets/`, nunca um `if` de data dentro do motor. Se a regra
nao couber nos campos existentes do `RuleSet`, adicione o campo ao tipo e a todos os
rulesets. Deixar um ruleset sem o campo torna o comportamento dependente da ordem dos
arquivos.

Toda decisao de preco precisa de um `reasonCode` com texto em PT e EN
(`packages/pricing-engine/src/reason-codes.ts`).

## Contribuindo uma dica

As dicas vivem em `packages/tips-engine/src/rules/catalogue.ts`. Cada uma e uma funcao pura
que recebe a conversa precificada e devolve `Tip | null`. Requisitos:

- `triggeredBy` so com ids de mensagem que existem na conversa (tem teste).
- Texto nos dois idiomas, com a economia estimada em dinheiro e nao em percentual.
- Nada de conselho que a gente nao consiga quantificar: se nao da para estimar a economia,
  a dica e `severity: 'info'` com `savingMicros: 0`.

## Convencoes de codigo

**Imports relativos nao levam extensao.** Escreva `from './types'`, nunca `from './types.js'`.
O monorepo distribui codigo TypeScript em vez de build, e o app web consome esse codigo
direto pelo webpack do Next via `transpilePackages`. O webpack nao remapeia `./types.js`
para `types.ts` como o vitest, o tsx e a resolucao `Bundler` do tsc fazem, entao um sufixo
`.js` passa no teste e no typecheck e quebra so no `pnpm build:web`. Ha um teste que pega
isso (`module-specifiers.test.ts`).

## Rodando

```bash
pnpm install
pnpm test
pnpm typecheck
pnpm dev:web
```

### Se o repo estiver dentro de uma pasta sincronizada (Google Drive, Dropbox, iCloud)

Opcional, e so afeta a sua maquina: apontar `node_modules` para o disco local deixa o
`pnpm install` cerca de 8x mais rapido, porque a pasta sincronizada tenta subir para a
nuvem cada um dos milhares de arquivos.

```bash
LOCAL="$HOME/.pnpm-node-modules/dyvit-whatsapp-simulator/node_modules"
rm -rf node_modules && mkdir -p "$LOCAL" && ln -s "$LOCAL" node_modules
pnpm install
```

O caminho de destino **precisa terminar em `node_modules`**. O `require-hook` do Next
resolve pelo realpath, entao um alvo com outro nome faz o `next build` quebrar com
`Cannot find module 'styled-jsx/package.json'` — o vitest e o tsc nao quebram, porque
usam resolvers que preservam o symlink.

Para desfazer: `rm node_modules && pnpm install`.

## Calendario de precos

A Meta so muda preco em 01/01, 01/04, 01/07 e 01/10, com aviso minimo de 1 mes para rate
card, 3 meses para add-on de modelo e 6 meses para mudanca de modelo. O workflow de CI
`rate-card-freshness` roda a checagem dos dados para que um ruleset prestes a expirar
apareca antes de expirar.
