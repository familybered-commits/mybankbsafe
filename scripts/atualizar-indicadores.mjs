/* Atualiza data/indicadores.json com as séries do Banco Central (SGS).
   Uso: node scripts/atualizar-indicadores.mjs   (Node 18+)
   O app também tenta completar os meses mais recentes direto do BCB no navegador,
   mas manter este arquivo atualizado deixa tudo mais rápido e funciona offline. */
import fs from 'fs';
const FILE = new URL('../data/indicadores.json', import.meta.url);
const SERIES = { ipca: 433, igpm: 189, cdi: 4391, poupanca: 196, ptax: 3698 };
const base = JSON.parse(fs.readFileSync(FILE, 'utf8'));
const thisMonth = new Date().toISOString().slice(0, 7);
const mnum = k => { const [y, m] = k.split('-').map(Number); return y * 12 + m - 1; };
for (const [key, code] of Object.entries(SERIES)) {
  const s = base.series[key];
  const start = mnum(s.inicio);
  const url = `https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=01/01/2023`;
  const rows = await (await fetch(url)).json();
  let added = 0;
  for (const r of rows) {
    const [, m, y] = r.data.split('/');
    const mk = `${y}-${m}`;
    if (mk >= thisMonth) continue;                       // só meses fechados
    const i = mnum(mk) - start, v = parseFloat(r.valor);
    if (i === s.valores.length) { s.valores.push(v); added++; }
    else if (i >= 0 && i < s.valores.length) s.valores[i] = v;
  }
  const end = start + s.valores.length - 1;
  s.fim = `${Math.floor(end / 12)}-${String(end % 12 + 1).padStart(2, '0')}`;
  console.log(`${key.padEnd(9)} até ${s.fim}  (+${added} meses)`);
}
base.atualizado = new Date().toISOString().slice(0, 10);
fs.writeFileSync(FILE, JSON.stringify(base));
console.log('ok →', FILE.pathname);
