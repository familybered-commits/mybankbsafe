/* ═══════════════════════════════════════════════════════
   MOTOR DA CARTEIRA — somente leitura (watch-only)
   Deriva endereços a partir de chaves públicas estendidas e consulta
   uma API no padrão Esplora (mempool.space, blockstream.info ou seu nó).
   Nenhuma chave privada é pedida, aceita ou processada.
   Bibliotecas empacotadas localmente (sem CDN em tempo de execução).
═══════════════════════════════════════════════════════ */
import { HDKey } from '@scure/bip32';
import { sha256 } from '@noble/hashes/sha256';
import { ripemd160 } from '@noble/hashes/ripemd160';

const hash160 = b => ripemd160(sha256(b));
const dsha = b => sha256(sha256(b));

/* ── Base58 ── */
const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
export function b58encode(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s; }
  return s;
}
function b58decode(str) {
  let n = 0n;
  for (const c of str) {
    const v = B58.indexOf(c);
    if (v < 0) throw new Error('base58');
    n = n * 58n + BigInt(v);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const c of str) { if (c !== '1') break; bytes.unshift(0); }
  return new Uint8Array(bytes);
}
function b58check(payload) {
  const out = new Uint8Array(payload.length + 4);
  out.set(payload); out.set(dsha(payload).slice(0, 4), payload.length);
  return b58encode(out);
}

/* ── Bech32 (segwit v0) ── */
const BECH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i];
  }
  return chk;
}
const hrpExpand = h => [...[...h].map(c => c.charCodeAt(0) >> 5), 0, ...[...h].map(c => c.charCodeAt(0) & 31)];
function convertbits(data, from, to) {
  let acc = 0, bits = 0; const ret = [];
  for (const v of data) { acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; ret.push((acc >> bits) & ((1 << to) - 1)); } }
  if (bits > 0) ret.push((acc << (to - bits)) & ((1 << to) - 1));
  return ret;
}
function segwitAddr(prog, hrp = 'bc') {
  const data = [0, ...convertbits(Array.from(prog), 8, 5)];
  const pm = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const cs = Array.from({ length: 6 }, (_, i) => (pm >> (5 * (5 - i))) & 31);
  return hrp + '1' + [...data, ...cs].map(d => BECH[d]).join('');
}

/* ── Tipos de endereço ── */
export const ADDR_TYPES = {
  'p2wpkh':      { label: 'Native SegWit (bc1q)' },
  'p2sh-p2wpkh': { label: 'Nested SegWit (3…)' },
  'p2pkh':       { label: 'Legacy (1…)' },
};
function addrFromPub(pub, type) {
  const h = hash160(pub);
  if (type === 'p2wpkh') return segwitAddr(h);
  if (type === 'p2sh-p2wpkh') {
    const redeem = new Uint8Array(22); redeem[1] = 0x14; redeem.set(h, 2);
    const p = new Uint8Array(21); p[0] = 0x05; p.set(hash160(redeem), 1);
    return b58check(p);
  }
  const p = new Uint8Array(21); p[0] = 0x00; p.set(h, 1);
  return b58check(p);
}

/* ── Chaves estendidas (SLIP-132 → xpub) ── */
const VERSIONS = {
  '0488b21e': { name: 'xpub', single: null,          multi: null },
  '049d7cb2': { name: 'ypub', single: 'p2sh-p2wpkh', multi: null },
  '04b24746': { name: 'zpub', single: 'p2wpkh',      multi: null },
  '0295b43f': { name: 'Ypub', single: null,          multi: 'sh-wsh' },
  '02aa7ed3': { name: 'Zpub', single: null,          multi: 'wsh' },
};
const hex = b => Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
export function normalizeKey(key) {
  key = key.trim();
  let data;
  try { data = b58decode(key); } catch { throw new Error('err.keyInvalid'); }
  if (data.length !== 82) throw new Error('err.keyInvalid');
  const payload = data.slice(0, 78), cs = data.slice(78), chk = dsha(payload).slice(0, 4);
  for (let i = 0; i < 4; i++) if (cs[i] !== chk[i]) throw new Error('err.keyChecksum');
  const ver = hex(payload.slice(0, 4));
  const info = VERSIONS[ver];
  if (!info) throw new Error(ver.startsWith('04358') ? 'err.keyPrivate' : 'err.keyInvalid');
  const out = new Uint8Array(payload); out.set([0x04, 0x88, 0xb2, 0x1e], 0);
  return { xpub: b58check(out), info };
}

/* ── Interpretação do que o usuário colou ── */
const KEY_RE = /[xyzXYZtuvUV]p(?:ub|rv)[1-9A-HJ-NP-Za-km-z]{100,112}/g;
export function parseWalletInput(text) {
  const raw = (text || '').trim();
  if (!raw) throw new Error('err.empty');
  if (/[xyzt]prv[1-9A-HJ-NP-Za-km-z]{50,}/i.test(raw) || /\b(?:[a-z]{3,8}\s+){11,23}[a-z]{3,8}\b/.test(raw.toLowerCase()) && !/pub/.test(raw))
    throw new Error('err.private');
  let json = null;
  if (raw.startsWith('{')) { try { json = JSON.parse(raw); } catch {} }
  const src = json ? JSON.stringify(json) : raw;
  const keys = [...new Set(src.match(KEY_RE) || [])];
  if (keys.some(k => /prv/.test(k))) throw new Error('err.private');
  if (!keys.length) throw new Error('err.noKey');
  if (/\btr\s*\(/.test(src)) throw new Error('err.taproot');
  if (/\b(?:older|after)\s*\(/.test(src)) throw new Error('err.miniscript');
  const sortedM = src.match(/sortedmulti(?:_a)?\s*\(\s*(\d+)/);
  const multiM = src.match(/(?<![a-z_])multi(?:_a)?\s*\(\s*(\d+)/);
  const thrJson = json && (json.quorum?.requiredSigners || json.requiredSigners || json.m);

  if (keys.length === 1 && !sortedM && !multiM) {
    const { info } = normalizeKey(keys[0]);
    let type = info.single;
    if (/^\s*sh\s*\(\s*wpkh/.test(src)) type = 'p2sh-p2wpkh';
    else if (/^\s*wpkh\s*\(/.test(src)) type = 'p2wpkh';
    else if (/^\s*pkh\s*\(/.test(src)) type = 'p2pkh';
    return { kind: 'single', keys, addrType: type };
  }
  const wrapped = /^\s*sh\s*\(\s*wsh\s*\(/.test(src) || keys.every(k => k.startsWith('Ypub'));
  const m = sortedM ? +sortedM[1] : multiM ? +multiM[1] : thrJson ? +thrJson : null;
  return { kind: 'multisig', keys, m, n: keys.length, sorted: !multiM || !!sortedM, wrapped };
}

/* ── Derivação ── */
function cmpBytes(a, b) {
  for (let i = 0; i < Math.min(a.length, b.length); i++) if (a[i] !== b[i]) return a[i] - b[i];
  return a.length - b.length;
}
export function makeDeriver(cfg) {
  if (cfg.kind === 'single') {
    const node = HDKey.fromExtendedKey(normalizeKey(cfg.keys[0]).xpub);
    const chains = [node.deriveChild(0), node.deriveChild(1)];
    return (chain, i) => addrFromPub(chains[chain].deriveChild(i).publicKey, cfg.addrType || 'p2wpkh');
  }
  const { m, sorted, wrapped } = cfg;
  const n = cfg.keys.length;
  if (!(m >= 1 && m <= n)) throw new Error('err.threshold');
  if (n > 15) throw new Error('err.tooManyKeys');
  const nodes = cfg.keys.map(k => HDKey.fromExtendedKey(normalizeKey(k).xpub));
  const chains = [nodes.map(x => x.deriveChild(0)), nodes.map(x => x.deriveChild(1))];
  return (chain, i) => {
    const pubs = chains[chain].map(x => x.deriveChild(i).publicKey);
    if (sorted) pubs.sort(cmpBytes);
    const script = new Uint8Array(3 + n * 34); let o = 0;
    script[o++] = 0x50 + m;
    for (const pk of pubs) { script[o++] = 33; script.set(pk, o); o += 33; }
    script[o++] = 0x50 + n; script[o++] = 0xae;
    const wsh = sha256(script);
    if (!wrapped) return segwitAddr(wsh);
    const redeem = new Uint8Array(34); redeem[1] = 0x20; redeem.set(wsh, 2);
    const p = new Uint8Array(21); p[0] = 0x05; p.set(hash160(redeem), 1);
    return b58check(p);
  };
}

/* Para xpub sem indicação de tipo: sonda os 3 tipos e usa o que tem histórico */
export async function detectSingleType(cfg, api, log) {
  if (cfg.addrType) return cfg.addrType;
  for (const type of ['p2wpkh', 'p2sh-p2wpkh', 'p2pkh']) {
    const d = makeDeriver({ ...cfg, addrType: type });
    for (let i = 0; i < 3; i++) {
      try {
        const s = await api.addr(d(0, i));
        if (s.chain_stats.tx_count + s.mempool_stats.tx_count > 0) { log?.('scan.typeFound', { type: ADDR_TYPES[type].label }, 'ok'); return type; }
      } catch {}
    }
  }
  return 'p2wpkh';
}

/* ── API Esplora com repetição e fila de falhas ── */
const sleep = ms => new Promise(r => setTimeout(r, ms));
export function esplora(base) {
  base = base.replace(/\/+$/, '');
  async function get(path, tries = 3) {
    let last;
    for (let t = 0; t < tries; t++) {
      try {
        const r = await fetch(base + path, { signal: AbortSignal.timeout(12000), referrerPolicy: 'no-referrer', credentials: 'omit' });
        if (r.status === 429) { await sleep(2500 * (t + 1)); last = new Error('429'); continue; }
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return path.includes('/tip/height') ? +(await r.text()) : r.json();
      } catch (e) { last = e; await sleep(700 * (t + 1)); }
    }
    throw last;
  }
  return {
    base,
    addr: a => get('/address/' + a),
    async txs(a, total) {
      const all = await get('/address/' + a + '/txs');
      let conf = all.filter(t => t.status?.confirmed);
      let page = conf;
      while (page.length >= 25 && conf.length < total) {
        page = await get('/address/' + a + '/txs/chain/' + conf[conf.length - 1].txid);
        conf = conf.concat(page);
        await sleep(200);
      }
      return all.filter(t => !t.status?.confirmed).concat(conf);
    },
    tip: () => get('/blocks/tip/height'),
  };
}

/* ── Varredura completa com gap limit ── */
export async function scanWallet(cfg, apiBase, log, GAP = 20) {
  const api = esplora(apiBase);
  if (cfg.kind === 'single' && !cfg.addrType) cfg = { ...cfg, addrType: await detectSingleType(cfg, api, log) };
  const derive = makeDeriver(cfg);
  const addrs = [];           // endereços com histórico
  const failed = [];          // fila de repetição
  let checked = 0;

  async function probe(chain, idx) {
    const a = derive(chain, idx);
    const s = await api.addr(a);
    checked++;
    const tx = s.chain_stats.tx_count + s.mempool_stats.tx_count;
    if (tx > 0) addrs.push({ a, chain, idx, s });
    return tx > 0;
  }

  for (const chain of [0, 1]) {
    log?.(chain === 0 ? 'scan.external' : 'scan.change');
    let gap = 0, idx = 0;
    while (gap < GAP && idx < 1000) {
      const batch = [];
      for (let k = 0; k < 4 && idx + k < 1000; k++) batch.push(idx + k);
      const res = await Promise.all(batch.map(i => probe(chain, i).catch(() => { failed.push([chain, i]); return null; })));
      for (const used of res) { if (used === true) gap = 0; else if (used === false) gap++; }
      idx += batch.length;
      await sleep(180);
    }
  }
  if (failed.length) {
    log?.('scan.retrying', { n: failed.length });
    await sleep(4000);
    const still = [];
    for (const [c, i] of failed) { try { await probe(c, i); } catch { still.push([c, i]); } await sleep(300); }
    failed.length = 0; failed.push(...still);
  }

  // Transações (deduplicadas)
  const txMap = new Map();
  for (const x of addrs) {
    const total = x.s.chain_stats.tx_count;
    try { for (const t of await api.txs(x.a, total)) txMap.set(t.txid, t); }
    catch { failed.push([x.chain, x.idx]); }
    await sleep(150);
  }

  // Contabilidade no nível da carteira (corrige troco contado como aporte)
  const mine = new Set(addrs.map(x => x.a));
  const ledger = [];
  for (const t of txMap.values()) {
    let inSum = 0, outSum = 0, foreignOut = 0;
    for (const o of t.vout || []) { if (mine.has(o.scriptpubkey_address)) inSum += o.value; else foreignOut += o.value; }
    for (const i of t.vin || []) if (i.prevout && mine.has(i.prevout.scriptpubkey_address)) outSum += i.prevout.value;
    const net = inSum - outSum;
    const type = outSum === 0 ? 'in' : (foreignOut === 0 ? 'self' : 'out');
    ledger.push([t.txid, t.status?.block_time || 0, net, outSum > 0 ? (t.fee || 0) : 0, type, t.status?.block_height || 0]);
  }
  ledger.sort((a, b) => (a[1] || 9e12) - (b[1] || 9e12));

  let sats = 0, pending = 0, reuse = 0;
  for (const x of addrs) {
    sats += x.s.chain_stats.funded_txo_sum - x.s.chain_stats.spent_txo_sum;
    pending += x.s.mempool_stats.funded_txo_sum - x.s.mempool_stats.spent_txo_sum;
    if (x.chain === 0 && x.s.chain_stats.funded_txo_count > 1) reuse++;
  }
  let tip = 0; try { tip = await api.tip(); } catch {}
  return {
    addrType: cfg.addrType || null,
    sats, pending, reuse, tip, ledger,
    addrCount: addrs.length, checked,
    incomplete: failed.length,
    first: derive(0, 0),
    scannedAt: Date.now(),
  };
}
