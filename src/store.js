/* ═══════════════════════════════════════════════════════
   ARMAZENAMENTO — só no navegador do usuário
   Nada é enviado a servidor. Backup = arquivo criptografado
   (PBKDF2-SHA256 310.000 iterações + AES-256-GCM, WebCrypto nativo).
═══════════════════════════════════════════════════════ */
const KEY = 'mybank.v1';
const PREFS = 'mybank.prefs';

export const DEFAULT_API = 'https://mempool.space/api';

export function blankState() {
  return {
    v: 1,
    bank: null,                 // { name, style, opened }
    vaults: [],                 // { id, label, kind, cfg, created, scan }
    checks: { metal: false, keyTest: null, heirs: false, heirsTimelock: false, node: false },
    settings: { api: DEFAULT_API, remember: true },
  };
}

function safeGet(store, k) { try { return store.getItem(k); } catch { return null; } }
function safeSet(store, k, v) { try { store.setItem(k, v); return true; } catch { return false; } }
function safeDel(store, k) { try { store.removeItem(k); } catch {} }

export function loadPrefs() {
  try { return JSON.parse(safeGet(localStorage, PREFS)) || {}; } catch { return {}; }
}
export function savePrefs(p) { safeSet(localStorage, PREFS, JSON.stringify(p)); }

export function load() {
  const raw = safeGet(localStorage, KEY) || safeGet(sessionStorage, KEY);
  if (!raw) return blankState();
  try {
    const s = JSON.parse(raw);
    const b = blankState();
    return { ...b, ...s, checks: { ...b.checks, ...s.checks }, settings: { ...b.settings, ...s.settings } };
  } catch { return blankState(); }
}

export function save(state) {
  const json = JSON.stringify(state);
  if (state.settings.remember) { safeSet(localStorage, KEY, json); safeDel(sessionStorage, KEY); }
  else { safeSet(sessionStorage, KEY, json); safeDel(localStorage, KEY); }
}

export function wipe() {
  safeDel(localStorage, KEY); safeDel(sessionStorage, KEY);
  for (const k of ['mb.bcb', 'mb.btcusd.daily']) safeDel(localStorage, k);
}

/* ── Backup criptografado ── */
const enc = new TextEncoder(), dec = new TextDecoder();
const b64 = buf => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
async function deriveKey(pass, salt, iter) {
  const base = await crypto.subtle.importKey('raw', enc.encode(pass), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt, iterations: iter, hash: 'SHA-256' }, base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
}
export async function exportBackup(state, pass) {
  const clean = { ...state, vaults: state.vaults.map(v => ({ ...v, scan: null })) };
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const iter = 310000;
  const key = await deriveKey(pass, salt, iter);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(clean)));
  return JSON.stringify({ app: 'mybank.bsafebitcoin.org', v: 1, kdf: 'PBKDF2-SHA256', iter, salt: b64(salt), iv: b64(iv), data: b64(ct) });
}
export async function importBackup(text, pass) {
  const f = JSON.parse(text);
  if (f.app !== 'mybank.bsafebitcoin.org') throw new Error('err.backupFile');
  const key = await deriveKey(pass, unb64(f.salt), f.iter || 310000);
  let plain;
  try { plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(f.iv) }, key, unb64(f.data)); }
  catch { throw new Error('err.backupPass'); }
  const s = JSON.parse(dec.decode(plain));
  const b = blankState();
  return { ...b, ...s, checks: { ...b.checks, ...s.checks }, settings: { ...b.settings, ...s.settings } };
}
