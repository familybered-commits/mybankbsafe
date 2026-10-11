/* ═══════════════════════════════════════════════════════
   DIRETORIA ECONÔMICA
   Indicadores oficiais (BCB/SGS) + preço histórico do bitcoin.
   Nenhuma informação da carteira é enviada a estes serviços.
═══════════════════════════════════════════════════════ */
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LS = {
  get(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} },
};
async function getJSON(url, ms = 12000) {
  const r = await fetch(url, { signal: AbortSignal.timeout(ms), referrerPolicy: 'no-referrer', credentials: 'omit' });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ── Meses ── */
export const mkey = d => { const x = new Date(d); return x.getUTCFullYear() + '-' + String(x.getUTCMonth() + 1).padStart(2, '0'); };
const mnum = k => { const [y, m] = k.split('-').map(Number); return y * 12 + (m - 1); };
const mstr = n => Math.floor(n / 12) + '-' + String((n % 12) + 1).padStart(2, '0');
export const monthsBetween = (a, b) => mnum(b) - mnum(a);

/* ── Indicadores ── */
let IND = null;
const BCB = { ipca: 433, igpm: 189, cdi: 4391, poupanca: 196, ptax: 3698 };

export async function loadIndicators() {
  if (IND) return IND;
  const base = await getJSON('data/indicadores.json');
  IND = base.series;
  IND._updated = base.atualizado;
  // Atualização opcional direto do Banco Central (dados públicos; nada da carteira é enviado).
  const cached = LS.get('mb.bcb');
  if (cached && Date.now() - cached.at < 5 * 864e5) merge(cached.data);
  else refreshFromBCB().catch(() => {});
  return IND;
}
function merge(extra) {
  for (const [k, list] of Object.entries(extra || {})) {
    const s = IND[k]; if (!s || !list?.length) continue;
    const start = mnum(s.inicio);
    for (const [mk, v] of list) {
      const i = mnum(mk) - start;
      if (i === s.valores.length) s.valores.push(v);
      else if (i >= 0 && i < s.valores.length) s.valores[i] = v;
    }
    s.fim = mstr(start + s.valores.length - 1);
  }
}
async function refreshFromBCB() {
  const from = new Date(Date.now() - 400 * 864e5);
  const di = `${String(from.getUTCDate()).padStart(2, '0')}/${String(from.getUTCMonth() + 1).padStart(2, '0')}/${from.getUTCFullYear()}`;
  const out = {};
  const thisMonth = mkey(Date.now());
  for (const [k, code] of Object.entries(BCB)) {
    const rows = await getJSON(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${code}/dados?formato=json&dataInicial=${di}`, 10000);
    out[k] = rows.map(r => { const [d, m, y] = r.data.split('/'); return [`${y}-${m}`, parseFloat(r.valor)]; })
      .filter(([mk]) => mk < thisMonth);           // só meses fechados
    await sleep(150);
  }
  LS.set('mb.bcb', { at: Date.now(), data: out });
  merge(out);
}

/* valor mensal de uma série (taxa % ou nível); além do fim, repete o último */
function val(key, mk) {
  const s = IND[key]; const i = mnum(mk) - mnum(s.inicio);
  if (i < 0) return s.valores[0];
  return s.valores[Math.min(i, s.valores.length - 1)];
}
export const lastMonth = key => IND[key].fim;
export const isEstimated = (key, mk) => mnum(mk) > mnum(IND[key].fim);

/* Fator acumulado de uma taxa mensal entre duas datas (ms), pró-rata no mês de entrada */
export function growth(key, fromMs, toMs = Date.now()) {
  if (toMs <= fromMs) return 1;
  let f = 1;
  const a = new Date(fromMs), b = new Date(toMs);
  let cur = Date.UTC(a.getUTCFullYear(), a.getUTCMonth(), 1);
  while (cur <= toMs) {
    const next = Date.UTC(new Date(cur).getUTCFullYear(), new Date(cur).getUTCMonth() + 1, 1);
    const s = Math.max(cur, fromMs), e = Math.min(next, toMs);
    const frac = (e - s) / (next - cur);
    if (frac > 0) f *= Math.pow(1 + val(key, mkey(cur)) / 100, frac);
    cur = next;
  }
  return f;
}
export const ptax = ms => val('ptax', mkey(ms));

/* Acumulado em N meses fechados (para os cards do mercado) */
export function accum(key, months) {
  const s = IND[key]; const end = s.valores.length;
  let f = 1; for (let i = Math.max(0, end - months); i < end; i++) f *= 1 + s.valores[i] / 100;
  return (f - 1) * 100;
}
export function ipcaSince(mk) {             // inflação acumulada de mk até o último dado
  const s = IND.ipca; let f = 1;
  for (let i = Math.max(0, mnum(mk) - mnum(s.inicio)); i < s.valores.length; i++) f *= 1 + s.valores[i] / 100;
  return f;
}

/* ── Preço ao vivo ── */
export async function livePrice(apiBase) {
  try {
    const d = await getJSON('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd,brl&include_24hr_change=true', 9000);
    const b = d.bitcoin;
    return { usd: b.usd, brl: b.brl, ch: b.usd_24h_change ?? 0, src: 'CoinGecko' };
  } catch {}
  const p = await getJSON('https://mempool.space/api/v1/prices', 9000);
  let fx = null;
  try { const a = await getJSON('https://economia.awesomeapi.com.br/json/last/USD-BRL', 8000); fx = +a.USDBRL.bid; } catch {}
  if (!fx && IND) fx = IND.ptax.valores[IND.ptax.valores.length - 1];
  return { usd: p.USD, brl: p.USD * fx, ch: null, src: 'mempool.space' };
}
export async function chainInfo(apiBase) {
  const base = apiBase.replace(/\/+$/, '');
  const [h, fees] = await Promise.all([
    fetch(base + '/blocks/tip/height', { signal: AbortSignal.timeout(9000) }).then(r => r.text()).then(Number),
    getJSON(base.replace(/\/api$/, '/api/v1') + '/fees/recommended', 9000).catch(() => null),
  ]);
  return { height: h, fees };
}

/* ── Preço histórico diário do BTC em USD (cache local) ──
   Fontes, em ordem: Bitstamp (desde 2011) → Kraken → CoinGecko (365d). */
const HKEY = 'mb.btcusd.daily';
export async function btcHistory(fromSec) {
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;
  fromSec = Math.max(Math.floor(fromSec / DAY) * DAY - 3 * DAY, 1325376000); // ≥ 2012-01-01
  let cache = LS.get(HKEY) || { from: 0, to: 0, p: [] }; // p: [[dia, preço]]
  const have = cache.p.length && cache.from <= fromSec && cache.to >= now - 2 * DAY;
  if (!have) {
    const start = cache.p.length && cache.from <= fromSec ? cache.to - DAY : fromSec;
    const fresh = await fetchRange(start, now);
    const map = new Map(cache.from <= fromSec ? cache.p : []);
    for (const [d, v] of fresh) map.set(d, v);
    const p = [...map.entries()].sort((a, b) => a[0] - b[0]);
    cache = { from: Math.min(fromSec, cache.from && cache.from <= fromSec ? cache.from : fromSec), to: p.length ? p[p.length - 1][0] : now, p };
    LS.set(HKEY, cache);
  }
  return cache.p.filter(([d]) => d >= fromSec);
}
async function fetchRange(fromSec, toSec) {
  const DAY = 86400;
  // Bitstamp
  try {
    const out = []; let start = fromSec;
    for (let page = 0; page < 8 && start < toSec; page++) {
      const end = Math.min(start + 1000 * DAY, toSec);
      const d = await getJSON(`https://www.bitstamp.net/api/v2/ohlc/btcusd/?step=86400&limit=1000&start=${start}&end=${end}`, 15000);
      const c = d.data?.ohlc || [];
      if (!c.length) break;
      for (const k of c) out.push([+k.timestamp, +k.close]);
      start = end; await sleep(350);
    }
    if (out.length > 3) return out;
  } catch {}
  // mempool.space (histórico completo, mesmo servidor já usado para a blockchain)
  try {
    const d = await getJSON('https://mempool.space/api/v1/historical-price?currency=USD', 20000);
    const byDay = new Map();
    for (const p of d.prices || []) if (p.USD > 0 && p.time >= fromSec - DAY) byDay.set(Math.floor(p.time / DAY) * DAY, p.USD);
    if (byDay.size > 3) return [...byDay.entries()].sort((a, b) => a[0] - b[0]);
  } catch {}
  // Kraken (últimos ~720 dias)
  try {
    const d = await getJSON(`https://api.kraken.com/0/public/OHLC?pair=XBTUSD&interval=1440&since=${fromSec}`, 15000);
    const c = d.result?.XXBTZUSD || [];
    if (c.length > 3) return c.map(k => [k[0], +k[4]]);
  } catch {}
  // CoinGecko (até 365 dias na API pública)
  const days = Math.min(365, Math.ceil((toSec - fromSec) / DAY) + 1);
  const d = await getJSON(`https://api.coingecko.com/api/v3/coins/bitcoin/market_chart?vs_currency=usd&days=${days}&interval=daily`, 15000);
  return (d.prices || []).map(([ms, v]) => [Math.floor(ms / 1000 / DAY) * DAY, v]);
}
/* preço no dia (busca binária no histórico ordenado) */
export function priceAt(hist, sec) {
  if (!hist.length) return null;
  let lo = 0, hi = hist.length - 1;
  if (sec <= hist[0][0]) return hist[0][1];
  if (sec >= hist[hi][0]) return hist[hi][1];
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (hist[mid][0] <= sec) lo = mid; else hi = mid; }
  return hist[lo][1];
}

/* ═══════════════════════════════════════════════════════
   EVOLUÇÃO PATRIMONIAL
   Cada entrada/saída é convertida em R$ no dia (preço USD × PTAX do mês)
   e "investida" hipoteticamente nas alternativas pelo mesmo calendário.
═══════════════════════════════════════════════════════ */
export function evolution(ledger, hist, live) {
  const now = Date.now();
  const flows = ledger.filter(l => l[1] > 0 && l[2] !== 0).map(([txid, t, net, fee, type]) => {
    const usd = priceAt(hist, t);
    const fx = ptax(t * 1000);
    return { txid, t, sats: net, type, usd, brl: usd * fx, fx, valBrl: Math.abs(net) / 1e8 * usd * fx };
  });
  if (!flows.length) return null;
  const ins = flows.filter(f => f.sats > 0);
  const inBtc = ins.reduce((s, f) => s + f.sats / 1e8, 0);
  const inBrl = ins.reduce((s, f) => s + f.valBrl, 0);
  const inUsd = ins.reduce((s, f) => s + f.sats / 1e8 * f.usd, 0);
  const holdBtc = flows.reduce((s, f) => s + f.sats / 1e8, 0);

  const alt = (key, at = now) => flows.reduce((s, f) => f.t * 1000 > at ? s : s + Math.sign(f.sats) * f.valBrl * growth(key, f.t * 1000, at), 0);
  const altUsd = (at = now, fxAt) => flows.reduce((s, f) => f.t * 1000 > at ? s : s + Math.sign(f.sats) * (f.valBrl / f.fx) * fxAt, 0);

  const nowBrl = holdBtc * live.brl;
  const ipcaEq = alt('ipca'), cdiEq = alt('cdi'), poupEq = alt('poupanca'), usdEq = altUsd(now, live.brl / live.usd);
  const netBrl = flows.reduce((s, f) => s + Math.sign(f.sats) * f.valBrl, 0);

  // Série mensal para o gráfico
  const first = flows[0].t * 1000;
  const pts = [];
  const startM = new Date(first);
  let cur = Date.UTC(startM.getUTCFullYear(), startM.getUTCMonth() + 1, 1);
  const stamps = [first];
  while (cur < now) { stamps.push(cur); cur = Date.UTC(new Date(cur).getUTCFullYear(), new Date(cur).getUTCMonth() + 1, 1); }
  stamps.push(now);
  for (const ts of stamps) {
    const held = flows.reduce((s, f) => f.t * 1000 <= ts ? s + f.sats / 1e8 : s, 0);
    const p = ts === now ? live.usd : priceAt(hist, Math.floor(ts / 1000));
    const fx = ts === now ? live.brl / live.usd : ptax(ts);
    pts.push({
      ts, btc: held * p * fx,
      cdi: alt('cdi', ts), poup: alt('poupanca', ts), ipca: alt('ipca', ts),
      usd: altUsd(ts, fx),
      aportado: flows.reduce((s, f) => f.t * 1000 <= ts ? s + Math.sign(f.sats) * f.valBrl : s, 0),
    });
  }
  return {
    flows, inBtc, inBrl, inUsd, holdBtc, netBrl, nowBrl,
    avgBrl: inBtc ? inBrl / inBtc : 0, avgUsd: inBtc ? inUsd / inBtc : 0,
    ipcaEq, cdiEq, poupEq, usdEq, pts,
    realGain: ipcaEq > 0 ? nowBrl / ipcaEq - 1 : null,
    vsCdi: cdiEq > 0 ? nowBrl / cdiEq - 1 : null,
    estimated: isEstimated('ipca', mkey(now)),
  };
}

/* Retorno de cada ativo em uma janela de N meses (cards do mercado) */
export function periodReturns(hist, live, months) {
  const now = Date.now();
  const from = Date.UTC(new Date(now).getUTCFullYear(), new Date(now).getUTCMonth() - months, new Date(now).getUTCDate());
  const p0 = priceAt(hist, Math.floor(from / 1000));
  if (!p0 || hist[0][0] > from / 1000 + 5 * 86400) return null;
  const brl0 = p0 * ptax(from);
  return {
    btc: (live.brl / brl0 - 1) * 100,
    usd: ((live.brl / live.usd) / ptax(from) - 1) * 100,
    cdi: (growth('cdi', from, now) - 1) * 100,
    poupanca: (growth('poupanca', from, now) - 1) * 100,
    ipca: (growth('ipca', from, now) - 1) * 100,
  };
}
