# My Bank — você é o seu banco

Ferramenta gratuita da **BSafe Bitcoin** para acompanhar carteiras (inclusive multisig) em modo somente leitura,
com prova de reservas, extrato, evolução patrimonial contra IPCA/CDI/poupança/dólar e "nível do banco".

- **Sem cadastro**: nome do banco, cofres e controles ficam só no navegador do usuário (localStorage).
- **Sem rastreadores**: zero analytics, zero cookies, fontes e bibliotecas servidas do próprio domínio.
- **Sem custódia**: só chaves públicas (xpub/descriptor). Chaves privadas e palavras-semente são recusadas.

## Publicar na Vercel (mybank.bsafebitcoin.org)

1. Crie um **projeto novo** na Vercel só para o My Bank (não reutilize o projeto do site).
   - Pelo GitHub: suba esta pasta em um repositório e use *Add New → Project → Import*.
   - Pela linha de comando: `npx vercel --prod` dentro desta pasta.
   - Framework: **Other**. Não há etapa de build: o `vercel.json` já desliga build e install.
2. Em **Settings → Domains**, adicione `mybank.bsafebitcoin.org`.
3. No DNS do domínio, crie um registro **CNAME**: nome `mybank` → valor `cname.vercel-dns.com`.
4. **Não ative** Vercel Analytics nem Speed Insights neste projeto.

O `vercel.json` aplica a política de segurança (CSP): scripts, estilos e fontes só do próprio domínio,
proibição de ser embutido em outros sites (`frame-ancestors 'none'`) e `no-referrer`.

## Estrutura

```
index.html                 página única
assets/js/app.js           app compilado (gerado a partir de src/)
assets/js/theme-init.js    aplica o tema antes da pintura
assets/css/app.css         identidade visual (mesma do bsafebitcoin.org)
assets/fonts/              Bebas Neue, DM Sans, DM Mono (self-hosted)
assets/img/                logo e ilustrações da Black Sheep
data/indicadores.json      IPCA, IGP-M, CDI, poupança e PTAX mensais (BCB/SGS, desde 2010)
src/                       código-fonte legível
  app.js      interface (abas, telas, ações)
  wallet.js   derivação de endereços e varredura (single-sig e multisig P2WSH / P2SH-P2WSH)
  econ.js     indicadores, preço histórico, cálculos de evolução
  store.js    armazenamento local e backup criptografado (AES-256-GCM)
  i18n.js     todos os textos em PT e EN
scripts/atualizar-indicadores.mjs   atualiza data/indicadores.json direto do Banco Central
```

## Editar textos

Todos os textos estão em `src/i18n.js` (bloco `pt` e bloco `en`). Depois de editar:

```
npm install
npm run build
```

## Atualizar indicadores

O app já tenta completar os meses recentes direto do Banco Central no navegador (dados públicos, nada da
carteira é enviado). Para atualizar o arquivo-base, rode uma vez por mês:

```
npm run indicadores
```

## Fontes de dados

| Dado | Fonte | O que recebe do usuário |
|---|---|---|
| Saldo e transações | mempool.space (padrão), blockstream.info ou o nó do usuário | endereços consultados e IP |
| Preço ao vivo | CoinGecko (reserva: mempool.space + AwesomeAPI) | nada |
| Preço histórico | Bitstamp → mempool.space → Kraken → CoinGecko | nada |
| Indicadores | Banco Central do Brasil (SGS) | nada |

## Versão 1 — limites conhecidos

- Carteiras Taproot (`tr()`) e descriptors com timelock/miniscript ainda não são acompanhados
  (o app avisa e não cadastra). É o próximo passo para o contador de timelock de herança.
- Leitura de QR code pela câmera ainda não existe; aceita colar o texto ou carregar o arquivo exportado.
- Comparativos usam CDI, poupança, dólar e IPCA (séries oficiais). Ibovespa, S&P 500 e ouro foram
  retirados porque o dashboard antigo usava números fixos aproximados.
