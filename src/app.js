/* ═══════════════════════════════════════════════════════
   MY BANK — interface
═══════════════════════════════════════════════════════ */
import { t, setLang, lang, locale } from './i18n.js';
import * as W from './wallet.js';
import * as E from './econ.js';
import * as S from './store.js';
import { Chart, LineController, BarController, LineElement, BarElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip } from 'chart.js';
Chart.register(LineController, BarController, LineElement, BarElement, PointElement, LinearScale, CategoryScale, Filler, Tooltip);

const SITE = 'https://www.bsafebitcoin.org';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

let state = S.load();
let prefs = S.loadPrefs();
const rt = {
  live: null, chain: null, hist: null, histFrom: Infinity, histErr: false, histLoading: false, ind: null,
  scanning: new Set(), logs: {}, view: 'painel', learnIdx: 0, period: 12, xFilter: 'all',
  addOpen: false, addKind: 'multi', obName: '', obStyle: 'poss', charts: {}, server: 'mempool',
};

/* ── formatação ── */
const nf = (v, d = 0, extra = {}) => Number(v).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d, ...extra });
const btc = sats => nf((sats || 0) / 1e8, 8) + ' ₿';
const brl = (v, d = 0) => (v < 0 ? '−' : '') + 'R$ ' + nf(Math.abs(v), d);
const usd = (v, d = 0) => (v < 0 ? '−' : '') + 'US$ ' + nf(Math.abs(v), d);
const pct = (v, d = 1) => v == null || !isFinite(v) ? '—' : (v > 0 ? '+' : v < 0 ? '−' : '') + nf(Math.abs(v), d) + '%';
const cls = v => v > 0 ? 'up' : v < 0 ? 'down' : '';
const dt = sec => new Date(sec * 1000).toLocaleDateString(locale());
const monthName = mk => { const [y, m] = mk.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString(locale(), { month: 'short', year: 'numeric', timeZone: 'UTC' }).replace('.', ''); };
function ago(ms) {
  const s = (Date.now() - ms) / 1000;
  if (s < 90) return t('ago.now');
  if (s < 3600) return t('ago.m', { n: Math.round(s / 60) });
  if (s < 86400) return t('ago.h', { n: Math.round(s / 3600) });
  return t('ago.d', { n: Math.round(s / 86400) });
}
function bankName(b = state.bank) {
  if (!b) return 'My Bank';
  const n = b.name.trim();
  return ({ poss: `${n}'s Bank`, banco: `Banco ${n}`, bank: `${n} Bank` })[b.style] || n;
}
const isOwnNode = () => !/mempool\.space|blockstream\.info/.test(state.settings.api);
const explorer = () => {
  const a = state.settings.api;
  if (a.includes('blockstream.info')) return 'https://blockstream.info/tx/';
  if (a.includes('mempool.space')) return 'https://mempool.space/tx/';
  return a.replace(/\/api\/?$/, '') + '/tx/';
};
const persist = () => S.save(state);

/* ── tema e idioma ── */
function applyTheme() {
  const th = prefs.theme || 'dark';
  document.documentElement.setAttribute('data-theme', th);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', th === 'light' ? '#F4F3F1' : '#080808');
}
function applyLang() {
  setLang(prefs.lang || ((navigator.language || 'pt').toLowerCase().startsWith('pt') ? 'pt' : 'en'));
  document.title = t('meta.title');
}

/* ═════════ TOPBAR, ABAS, RODAPÉ ═════════ */
const ICON_SUN = '<svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>';
const ICON_MOON = '<svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>';

function renderTop() {
  const b = state.bank;
  const sub = b ? (b.block ? `${t('tb.sub')} · ${t('tb.since', { h: nf(b.block) })}` : t('tb.sub')) : t('slogan').toUpperCase();
  $('#topbar').innerHTML = `
    <div class="tb-left">
      <a class="tb-logo" href="${SITE}" rel="noopener" aria-label="BSafe Bitcoin"><img src="assets/img/logo-bsafe.png" alt="BSafe Bitcoin" width="88" height="44"></a>
      <div class="tb-sep"></div>
      <div class="tb-bank"><div class="tb-bank-name">${esc(bankName())}</div><div class="tb-bank-sub">${esc(sub)}</div></div>
    </div>
    <div class="tb-right">
      <span class="priv-badge" title="${esc(t('s.privacyList')[5])}">${t('tb.private')}</span>
      <button class="pill-btn" data-act="lang" aria-label="${t('tb.lang')}">${lang() === 'pt' ? 'EN' : 'PT'}</button>
      <button class="pill-btn theme-btn" data-act="theme" aria-label="${t('tb.theme')}">${ICON_SUN}${ICON_MOON}</button>
    </div>`;
}
const TABS = { painel: '🏛', cofres: '🔐', extrato: '📜', evolucao: '📈', mercado: '🌐', ajustes: '⚙' };
function renderTabs() {
  const list = state.bank ? Object.keys(TABS) : ['abrir', 'mercado'];
  $('#tabs').innerHTML = list.map(k => `<button class="tab ${rt.view === k ? 'active' : ''}" data-act="go" data-v="${k}"><span class="tab-ic" aria-hidden="true">${k === 'abrir' ? '🏦' : TABS[k]}</span>${t('tab.' + k)}</button>`).join('');
}
function renderFoot() {
  $('#foot').innerHTML = `<div>${t('foot.by')}</div><div><b>${t('foot.custody')}</b></div><div class="disc">${t('foot.disc')}</div>`;
}

/* ═════════ ROTEAMENTO ═════════ */
function go(v) {
  if (!state.bank && !['abrir', 'mercado'].includes(v)) v = 'abrir';
  rt.view = v;
  try { history.replaceState(null, '', '#' + v); } catch {}
  renderTabs(); renderView();
  window.scrollTo(0, 0);
}
function renderAll() { renderTop(); renderTabs(); renderView(); renderFoot(); }
function renderView() {
  for (const c of Object.values(rt.charts)) c.destroy();
  rt.charts = {};
  const ob = rt.view === 'abrir';
  $('#onboarding').classList.toggle('hidden', !ob);
  $('#main').classList.toggle('hidden', ob);
  if (ob) { $('#onboarding').innerHTML = viewOnboarding(); return; }
  const fn = { painel: viewPainel, cofres: viewCofres, extrato: viewExtrato, evolucao: viewEvolucao, mercado: viewMercado, ajustes: viewAjustes }[rt.view];
  $('#main').innerHTML = `<div class="view active">${fn()}</div>`;
  after[rt.view]?.();
}
const after = {};

/* ═════════ ABERTURA DO BANCO ═════════ */
function facadeHTML() {
  const name = rt.obName.trim() ? bankName({ name: rt.obName, style: rt.obStyle }) : (lang() === 'pt' ? "Seu nome's Bank" : "Your name's Bank");
  const d = new Date().toLocaleDateString(locale());
  return `<div class="facade" aria-live="polite">
      <div class="facade-top"><span>${t('ob.facade.top')}</span><span>₿</span></div>
      <div class="facade-name" id="facade-name">${esc(name)}</div>
      <div class="facade-slogan">${t('slogan')}</div>
      <div class="facade-foot"><span>${t('ob.facade.est', { d })}</span><span>${t('ob.facade.kyc')}</span>${rt.chain ? `<span>#${nf(rt.chain.height)}</span>` : ''}</div>
    </div>`;
}
function styleChips(name, active, act) {
  const n = (name || '').trim() || (lang() === 'pt' ? 'Nome' : 'Name');
  return [['poss', `${n}'s Bank`], ['banco', `Banco ${n}`], ['bank', `${n} Bank`], ['custom', t('ob.custom')]]
    .map(([k, l]) => `<button class="chip ${active === k ? 'active' : ''}" data-act="${act}" data-k="${k}" role="radio" aria-checked="${active === k}">${esc(l)}</button>`).join('');
}
function viewOnboarding() {
  const rows = ['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7'].map(r => t('ob.vs.' + r));
  return `<div class="ob">
    <div class="ob-glow"></div><div class="ob-grid-bg"></div>
    <div class="ob-hero">
      <div>
        <div class="badge"><span class="dot"></span>${t('ob.badge')}</div>
        <h1 class="ob-h">${t('ob.h1')}<span class="hi">${t('ob.h2')}</span></h1>
        <p class="ob-sub">${t('ob.sub')}</p>
        <div class="open-box">
          <label class="flabel" for="ob-name">${t('ob.ask')}</label>
          <div class="open-row">
            <input class="input" id="ob-name" data-in="obname" maxlength="32" placeholder="${t('ob.ph')}" value="${esc(rt.obName)}" autocomplete="off" spellcheck="false">
            <button class="btn-p" data-act="open">${t('ob.open')}</button>
          </div>
          <div class="styles" id="ob-styles" role="radiogroup" aria-label="${t('ob.style')}">${styleChips(rt.obName, rt.obStyle, 'obstyle')}</div>
          <div id="facade">${facadeHTML()}</div>
          <p class="card-sub" style="margin-top:12px">${t('ob.hint')}</p>
          <div style="display:flex;gap:18px;flex-wrap:wrap;margin-top:12px">
            <button class="link-btn" data-act="import">${t('ob.import')}</button>
            <button class="link-btn" data-act="go" data-v="mercado">${t('ob.peek')}</button>
          </div>
        </div>
      </div>
      <figure class="ob-art"><img src="assets/img/banco-ovelha.webp" alt="" width="720" height="720"><figcaption>${t('ob.art')}</figcaption></figure>
    </div>
    <div class="pillars">
      <div class="pillar"><div class="pi">🪪</div><div class="pt">${t('ob.p1t')}</div><div class="px">${t('ob.p1x')}</div></div>
      <div class="pillar"><div class="pi">🕶️</div><div class="pt">${t('ob.p2t')}</div><div class="px">${t('ob.p2x')}</div></div>
      <div class="pillar"><div class="pi">🔑</div><div class="pt">${t('ob.p3t')}</div><div class="px">${t('ob.p3x')}</div></div>
    </div>
    <div class="versus">
      <div class="sec-head"><div class="sec-title">${t('ob.vs.title')}</div></div>
      <div class="tbl-wrap"><table class="vs-table"><thead><tr><th></th><th>${t('ob.vs.h1')}</th><th>${t('ob.vs.h2')}</th></tr></thead>
      <tbody>${rows.map(r => `<tr><td>${r[0]}</td><td>${r[1]}</td><td>${r[2]}</td></tr>`).join('')}</tbody></table></div>
    </div>
  </div>`;
}

/* ═════════ PAINEL ═════════ */
function totals() {
  let sats = 0, pending = 0, single = 0, reuse = 0, inc = 0, tip = 0, oldest = Infinity, scanned = 0;
  for (const v of state.vaults) {
    const s = v.scan; if (!s) continue;
    scanned++;
    sats += s.sats; pending += s.pending; reuse += s.reuse; inc += s.incomplete;
    if (v.kind === 'single') single += s.sats;
    tip = Math.max(tip, s.tip || 0); oldest = Math.min(oldest, s.scannedAt);
  }
  return { sats, pending, single, reuse, inc, tip, oldest: oldest === Infinity ? null : oldest, scanned };
}
function levelInfo() {
  const c = state.checks, T = totals();
  const keyOk = !!c.keyTest && Date.now() - c.keyTest < 183 * 864e5;
  const conds = [
    state.vaults.length > 0,
    c.metal && keyOk,
    state.vaults.some(v => v.kind === 'multisig'),
    c.heirs,
    isOwnNode() && T.reuse === 0 && keyOk,
  ];
  let lv = 0; for (const ok of conds) { if (ok) lv++; else break; }
  return { lv, conds, keyOk };
}
function alerts() {
  const T = totals(), L = levelInfo(), out = [];
  if (!state.vaults.length) return out;
  if (T.inc) out.push(['bad', '⚠️', t('al.inct'), t('al.incx', { n: T.inc })]);
  if (!L.keyOk) out.push(['warn', '🔑', t('al.keyt'), t('al.keyx')]);
  if (T.reuse) out.push(['warn', '♻️', t('al.reuset'), t('al.reusex', { n: T.reuse })]);
  if (T.single > 1e7 && T.single > T.sats * 0.25) out.push(['warn', '🔐', t('al.singlet'), t('al.singlex', { v: btc(T.single) })]);
  if (T.oldest && Date.now() - T.oldest > 864e5) out.push(['', '🕰️', t('al.stalet'), t('al.stalex', { t: ago(T.oldest) })]);
  if (T.pending) out.push(['', '⏳', t('al.pendt'), t('al.pendx', { v: btc(Math.abs(T.pending)) })]);
  if (!isOwnNode()) out.push(['', '🛰️', t('al.nodet'), t('al.nodex', { s: new URL(state.settings.api).host })]);
  if (!out.some(a => a[0] === 'bad' || a[0] === 'warn')) out.unshift(['good', '✅', t('al.ok'), t('al.okx')]);
  return out;
}
function reserveHTML() {
  const T = totals(), L = rt.live;
  const v = T.sats / 1e8;
  const fresh = T.oldest && Date.now() - T.oldest < 864e5;
  const por = T.oldest
    ? `<span class="por ${fresh ? '' : 'stale'}">${fresh ? t('p.por', { h: nf(T.tip), t: new Date(T.oldest).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' }) }) : t('p.porStale')}</span>`
    : `<span class="por stale">${t('p.porNone')}</span>`;
  return `<div class="reserve">
    <div class="reserve-top">
      <div>
        <div class="stag">${t('p.reserves', { bank: esc(bankName()) })}</div>
        <div class="reserve-btc">${nf(v, 8)}<small>BTC</small></div>
        <div class="reserve-fiat">
          <div><span>BRL</span><b data-bind="resBrl">${L ? brl(v * L.brl) : '—'}</b></div>
          <div><span>USD</span><b data-bind="resUsd">${L ? usd(v * L.usd) : '—'}</b></div>
          <div><span>SATS</span><b>${nf(T.sats)}</b></div>
          ${T.pending ? `<div class="muted">${t('p.pending', { v: btc(T.pending) })}</div>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:10px;align-items:flex-end">
        ${por}
        <button class="btn-g btn-s" data-act="scanall" ${rt.scanning.size ? 'disabled' : ''}>${rt.scanning.size ? '<span class="spin"></span>' : '↻'} ${t('p.refreshAll')}</button>
      </div>
    </div>
    <p class="reserve-meta">${t('p.reserveMeta')}</p>
  </div>`;
}
function levelHTML() {
  const { lv, conds } = levelInfo();
  const C = 2 * Math.PI * 52, frac = lv / 5;
  const steps = [1, 2, 3, 4, 5].map(i => `<li class="${conds[i - 1] ? 'done' : i === lv + 1 ? 'next' : ''}"><span class="st">${conds[i - 1] ? '✓' : i}</span><span><b>${t('lv.' + i)}</b> — ${t('lv.' + i + 'd')}</span></li>`).join('');
  const cta = lv + 1 === 3 ? `<a class="btn-p btn-s" style="margin-top:16px" href="${SITE}/#kit" rel="noopener">${t('lv.kitCta')}</a>`
    : lv + 1 === 4 ? `<a class="btn-g btn-s" style="margin-top:16px" href="${SITE}/#custodia" rel="noopener">${t('lv.heirCta')}</a>` : '';
  return `<div class="card hl">
    <div class="card-label">${t('p.level')}</div>
    <div class="level">
      <div class="level-ring"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" fill="none" stroke="var(--bg3)" stroke-width="8"/><circle cx="60" cy="60" r="52" fill="none" stroke="var(--btc)" stroke-width="8" stroke-linecap="round" stroke-dasharray="${C * frac} ${C}"/></svg>
        <div class="lv-n">${lv}<small>${t('lv.of')}</small></div></div>
      <div><div class="level-name">${t('lv.' + lv)}</div><div class="level-desc">${t('lv.' + lv + 'd')}</div></div>
    </div>
    <ul class="steps">${steps}</ul>${cta}
  </div>`;
}
function learnHTML() {
  const cards = t('learn');
  const i = rt.learnIdx % cards.length;
  let [ic, ti, tx] = cards[i];
  if (rt.ind && tx.includes('{v}')) {
    const f = E.ipcaSince('2010-01');
    tx = tx.replace('{v}', nf(100 * f, 0)).replace('{p}', nf((1 - 1 / f) * 100, 0));
  }
  return `<div class="learn">
    <div class="learn-ic" aria-hidden="true">${ic}</div>
    <div><div class="learn-t">${ti}</div><div class="learn-x">${tx}</div>
      <div class="learn-nav">${cards.map((_, k) => `<button class="${k === i ? 'active' : ''}" data-act="learn" data-k="${k}" aria-label="${k + 1}"></button>`).join('')}</div></div>
  </div>`;
}
function viewPainel() {
  const al = alerts();
  if (!state.vaults.length) {
    return `${reserveHTML()}
      <div class="sec empty">
        <img src="assets/img/black-sheep.webp" alt="" width="140" height="140">
        <h3>${t('empty.t')}</h3><p>${t('empty.x')}</p>
        <div class="acts"><button class="btn-p" data-act="addvault">${t('empty.add')}</button><a class="btn-g" href="${SITE}/#kit" rel="noopener">${t('empty.kit')}</a></div>
      </div>
      <div class="sec grid g2">${levelHTML()}<div>${learnHTML()}</div></div>`;
  }
  const c = state.checks;
  const vaults = state.vaults.map(v => {
    const s = v.scan;
    return `<div class="vault" style="grid-template-columns:auto 1fr auto">
      <div class="vault-ic">${v.kind === 'multisig' ? '🔐' : '💳'}</div>
      <div><div class="vault-name">${esc(v.label)}</div><div class="vault-meta">${vaultTags(v)}</div></div>
      <div class="vault-bal">${rt.scanning.has(v.id) ? '<span class="spin"></span>' : `<div class="b1">${s ? btc(s.sats) : '—'}</div><div class="b2">${s && rt.live ? brl(s.sats / 1e8 * rt.live.brl) : ''}</div>`}</div>
    </div>`;
  }).join('');
  return `${reserveHTML()}
    <div class="sec grid g2">
      ${levelHTML()}
      <div class="card"><div class="card-label">${t('p.audit')}</div>
        <div class="alerts">${al.map(([k, i, tt, x]) => `<div class="alert ${k}"><span class="ai">${i}</span><div><b>${tt}</b>${x}</div></div>`).join('')}</div>
      </div>
    </div>
    <div class="sec"><div class="sec-head"><div class="sec-title">${t('p.vaults')}</div><button class="link-btn" data-act="go" data-v="cofres">${t('tab.cofres')} →</button></div>
      <div class="vault-list">${vaults}</div></div>
    <div class="sec grid g2">
      <div class="card"><div class="card-label">${t('p.controls')}</div>
        ${checkRow('metal', c.metal)}
        <div class="check" style="cursor:default"><span style="width:20px;height:20px;flex-shrink:0;display:grid;place-items:center;color:${levelInfo().keyOk ? 'var(--green)' : 'var(--amber)'}">●</span>
          <div style="flex:1"><div class="check-t">${t('ck.key')}</div><div class="check-d">${t('ck.keyd', { d: c.keyTest ? new Date(c.keyTest).toLocaleDateString(locale()) + ' (' + ago(c.keyTest) + ')' : t('ck.keyNever') })}</div></div>
          <button class="btn-g btn-s" data-act="keytest">${t('ck.keyBtn')}</button></div>
        ${checkRow('heirs', c.heirs)}${checkRow('heirsTimelock', c.heirsTimelock, 'tl')}
        <div class="check" style="cursor:default"><span style="width:20px;height:20px;flex-shrink:0;display:grid;place-items:center;color:${isOwnNode() ? 'var(--green)' : 'var(--muted)'}">●</span><div><div class="check-t">${t('ck.node')}</div><div class="check-d">${t('ck.noded')}</div></div></div>
        <p class="card-sub" style="margin-top:10px">${t('p.controlsNote')}</p>
      </div>
      <div style="display:grid;gap:16px;align-content:start">
        <div><div class="card-label" style="margin-bottom:10px">${t('p.learn')}</div>${learnHTML()}</div>
        <div class="card"><button class="btn-p" data-act="report" style="width:100%">📄 ${t('p.report')}</button><p class="card-sub" style="margin-top:10px">${t('p.reportNote')}</p></div>
      </div>
    </div>`;
}
function checkRow(k, on, label = k) {
  return `<label class="check"><input type="checkbox" data-act="check" data-k="${k}" ${on ? 'checked' : ''}><div><div class="check-t">${t('ck.' + label)}</div><div class="check-d">${t('ck.' + label + 'd')}</div></div></label>`;
}
function vaultTags(v) {
  const c = v.cfg, s = v.scan;
  const tags = [];
  if (v.kind === 'multisig') tags.push(`<span class="tag">${t('v.multi', { m: c.m, n: c.keys.length })}</span><span class="tag grey">${c.wrapped ? 'P2SH-P2WSH' : 'P2WSH'}</span>`);
  else tags.push(`<span class="tag grey">${W.ADDR_TYPES[c.addrType || s?.addrType || 'p2wpkh']?.label || ''}</span>`);
  if (rt.scanning.has(v.id)) tags.push(`<span>${t('v.scanning')}</span>`);
  else if (s) tags.push(`<span>${t('v.verified', { h: nf(s.tip), t: ago(s.scannedAt) })}</span>`);
  else tags.push(`<span>${t('v.never')}</span>`);
  return tags.join('');
}

/* ═════════ COFRES ═════════ */
function viewCofres() {
  const open = rt.addOpen || !state.vaults.length;
  const list = state.vaults.map(v => {
    const s = v.scan, busy = rt.scanning.has(v.id);
    const logs = rt.logs[v.id] || [];
    return `<div class="vault" id="vault-${v.id}">
      <div class="vault-ic">${v.kind === 'multisig' ? '🔐' : '💳'}</div>
      <div><div class="vault-name">${esc(v.label)}</div><div class="vault-meta">${vaultTags(v)}${s ? `<span>· ${t('v.addrs', { n: s.addrCount })}</span>` : ''}</div></div>
      <div class="vault-bal"><div class="b1">${s ? btc(s.sats) : '—'}</div><div class="b2">${s && rt.live ? brl(s.sats / 1e8 * rt.live.brl) : ''}</div></div>
      ${busy ? '<div class="progress"><i></i></div>' : ''}
      ${logs.length ? `<div class="scanlog" id="log-${v.id}">${logs.map(logLine).join('')}</div>` : ''}
      <div class="vault-actions">
        <button class="btn-g btn-s" data-act="scan" data-id="${v.id}" ${busy ? 'disabled' : ''}>↻ ${t('v.refresh')}</button>
        <button class="btn-g btn-s" data-act="firstaddr" data-id="${v.id}">${t('v.firstAddr')}</button>
        <button class="btn-g btn-s" data-act="rename" data-id="${v.id}">${t('v.rename')}</button>
        <button class="btn-g btn-s btn-danger" data-act="remove" data-id="${v.id}" ${busy ? 'disabled' : ''}>${t('v.remove')}</button>
      </div>
    </div>`;
  }).join('');
  const multi = rt.addKind === 'multi';
  const form = `<div class="card hl" id="addform">
    <div class="sec-head" style="margin-bottom:12px"><div class="sec-title">${t('v.add')}</div>
      <div class="seg"><button class="${multi ? 'active' : ''}" data-act="kind" data-k="multi">🔐 ${t('v.kindMulti')}</button><button class="${!multi ? 'active' : ''}" data-act="kind" data-k="single">💳 ${t('v.kindSingle')}</button></div></div>
    <div class="field"><label for="v-label">${t('v.label')}</label><input class="input" id="v-label" maxlength="40" placeholder="${multi ? t('v.labelPhMulti') : t('v.labelPhSingle')}" autocomplete="off"></div>
    <div class="field"><label for="v-input">${multi ? t('v.inputMulti') : t('v.inputSingle')}</label>
      <textarea class="textarea" id="v-input" data-in="vinput" spellcheck="false" autocomplete="off" autocapitalize="off" placeholder="${esc(multi ? t('v.phMulti') : t('v.phSingle'))}" ${multi ? '' : 'style="min-height:84px"'}></textarea>
      <label class="link-btn" style="display:inline-block;margin-top:8px;cursor:pointer">${t('v.file')}<input type="file" id="v-file" accept=".txt,.json,.bsms,.descriptor,text/plain,application/json" class="sr"></label>
    </div>
    <div id="v-preview"></div>
    <div class="field hidden" id="v-m-field"><label for="v-m">${t('v.m')}</label><input class="input" id="v-m" type="number" min="1" max="15" style="max-width:120px"></div>
    <button class="btn-p" data-act="addsubmit" style="margin-bottom:16px">${t('v.submit')}</button>
    <div class="note" style="margin-bottom:10px">${t('v.readonly')}</div>
    <p class="card-sub">${t('v.where')}</p>
  </div>`;
  return `<div class="stag">${esc(bankName())}</div><h1 class="stitle">${t('v.title')}</h1><p class="slead">${t('v.lead')}</p>
    <div class="sec vault-list">${list}</div>
    <div class="sec">${open ? form : `<button class="btn-p" data-act="addvault">+ ${t('v.add')}</button>`}</div>`;
}
after.cofres = () => {
  const f = $('#v-file');
  f?.addEventListener('change', async () => {
    const file = f.files?.[0]; if (!file) return;
    if (file.size > 200000) return;
    $('#v-input').value = (await file.text()).trim();
    previewInput();
  });
};
function logLine(l) { return `<div class="${l.c || ''}">${l.c === 'ok' ? '✓ ' : l.c === 'err' ? '✗ ' : '· '}${esc(t(l.k, l.v))}</div>`; }
function previewInput() {
  const el = $('#v-preview'), mf = $('#v-m-field');
  const text = $('#v-input')?.value || '';
  if (!el) return;
  if (!text.trim()) { el.innerHTML = ''; mf.classList.add('hidden'); return; }
  try {
    const p = W.parseWalletInput(text);
    if (p.kind === 'multisig' && p.keys.length < 2) throw new Error('err.single');
    if ((p.kind === 'multisig') !== (rt.addKind === 'multi')) {
      rt.addKind = p.kind === 'multisig' ? 'multi' : 'single';
      const label = $('#v-label').value;
      renderView(); $('#v-label').value = label; $('#v-input').value = text; previewInput(); return;
    }
    let d;
    if (p.kind === 'multisig') {
      d = `${p.m ? t('v.multi', { m: p.m, n: p.keys.length }) : p.keys.length + ' keys'} · ${p.wrapped ? 'P2SH-P2WSH' : 'P2WSH'}${p.sorted ? ' · sortedmulti' : ''}`;
      mf.classList.toggle('hidden', !!p.m);
      if (!p.m) { el.innerHTML = `<div class="note warn" style="margin-bottom:14px">${t('v.needM', { n: p.keys.length })}</div>`; return; }
    } else {
      const { info } = W.normalizeKey(p.keys[0]);
      d = `${info.name} · ${p.addrType ? W.ADDR_TYPES[p.addrType].label : (lang() === 'pt' ? 'tipo detectado na verificação' : 'type detected on verification')}`;
      mf.classList.add('hidden');
    }
    W.makeDeriver(p.kind === 'multisig' ? p : { ...p, addrType: p.addrType || 'p2wpkh' });
    el.innerHTML = `<div class="note ok" style="margin-bottom:14px">${esc(t('v.detected', { d }))}</div>`;
  } catch (e) {
    mf.classList.add('hidden');
    el.innerHTML = `<div class="note warn" style="margin-bottom:14px">${esc(t(e.message))}</div>`;
  }
}
async function addVault() {
  const text = $('#v-input').value;
  let p;
  try {
    p = W.parseWalletInput(text);
    if (p.kind === 'multisig') {
      if (p.keys.length < 2) throw new Error('err.single');
      if (!p.m) p.m = parseInt($('#v-m').value, 10);
      if (!(p.m >= 1 && p.m <= p.keys.length)) throw new Error('err.threshold');
    }
    W.makeDeriver(p.kind === 'multisig' ? p : { ...p, addrType: p.addrType || 'p2wpkh' });
  } catch (e) { toast(t(e.message)); previewInput(); return; }
  const sig = p.keys.slice().sort().join('|');
  if (state.vaults.some(v => v.cfg.keys.slice().sort().join('|') === sig)) { toast(lang() === 'pt' ? 'Esse cofre já está cadastrado.' : 'That vault is already added.'); return; }
  const n = state.vaults.length + 1;
  const label = $('#v-label').value.trim() || (p.kind === 'multisig' ? (lang() === 'pt' ? `Cofre ${n}` : `Vault ${n}`) : (lang() === 'pt' ? `Conta ${n}` : `Account ${n}`));
  const v = {
    id: Math.random().toString(36).slice(2, 10), label, kind: p.kind, created: Date.now(), scan: null,
    cfg: p.kind === 'multisig' ? { kind: 'multisig', keys: p.keys, m: p.m, sorted: p.sorted, wrapped: p.wrapped } : { kind: 'single', keys: p.keys, addrType: p.addrType },
  };
  state.vaults.push(v); persist();
  rt.addOpen = false;
  renderView();
  scanVault(v.id);
}

/* ── varredura ── */
async function scanVault(id) {
  const v = state.vaults.find(x => x.id === id);
  if (!v || rt.scanning.has(id)) return;
  rt.scanning.add(id); rt.logs[id] = [];
  const log = (k, vars, c) => {
    rt.logs[id].push({ k, v: vars, c });
    const el = $('#log-' + id);
    if (el) { el.insertAdjacentHTML('beforeend', logLine(rt.logs[id].at(-1))); el.scrollTop = el.scrollHeight; }
  };
  rerenderSoft();
  log('scan.start');
  try {
    const res = await W.scanWallet(v.cfg, state.settings.api, log);
    if (v.kind === 'single' && !v.cfg.addrType && res.addrType) v.cfg.addrType = res.addrType;
    v.scan = res; rt.evoKey = null;
    persist();
    log('scan.done', { v: btc(res.sats) }, 'ok');
  } catch (e) {
    log('scan.fail', { e: t(e.message) }, 'err');
  }
  rt.scanning.delete(id);
  setTimeout(() => { if (!rt.scanning.has(id)) delete rt.logs[id]; }, 20000);
  rerenderSoft();
}
async function scanAll() { for (const v of state.vaults) await scanVault(v.id); }
function rerenderSoft() {
  const a = document.activeElement;
  if (a && a.matches('input,textarea') && $('#main').contains(a)) {
    // não destruir um formulário em edição: atualiza só a lista
    if (rt.view === 'cofres') {
      const tmp = document.createElement('div'); tmp.innerHTML = viewCofres();
      const fresh = tmp.querySelector('.vault-list'), cur = $('#main .vault-list');
      if (fresh && cur) cur.replaceWith(fresh);
    }
    return;
  }
  renderTop(); renderView();
}

/* ═════════ EXTRATO ═════════ */
function mergedLedger(filter = 'all') {
  const map = new Map();
  for (const v of state.vaults) {
    if (filter !== 'all' && v.id !== filter) continue;
    for (const [txid, time, net, fee, type, height] of v.scan?.ledger || []) {
      const cur = map.get(txid) || { txid, time, net: 0, fee: 0, types: [], vaults: [], height };
      cur.net += net; cur.fee = Math.max(cur.fee, fee); cur.types.push(type); cur.vaults.push(v.label);
      map.set(txid, cur);
    }
  }
  return [...map.values()].map(x => {
    let type = x.types.length === 1 ? x.types[0] : (x.net > 0 ? 'in' : Math.abs(x.net) <= x.fee + 1 ? 'self' : 'out');
    if (x.net > 0 && type !== 'in') type = 'in';
    return { ...x, type };
  });
}
function viewExtrato() {
  const rows = mergedLedger(rt.xFilter).sort((a, b) => (b.time || 9e12) - (a.time || 9e12));
  if (rows.some(r => r.time) && !rt.hist && !rt.histLoading && !rt.histErr) ensureHist(Math.min(...rows.filter(r => r.time).map(r => r.time))).then(h => h && rt.view === 'extrato' && renderView());
  const opts = `<option value="all">${t('x.all')}</option>` + state.vaults.map(v => `<option value="${v.id}" ${rt.xFilter === v.id ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
  const ex = explorer();
  const body = rows.slice(0, 600).map(r => {
    const p = rt.hist && r.time ? E.priceAt(rt.hist, r.time) * E.ptax(r.time * 1000) : null;
    return `<tr>
      <td class="m">${r.time ? dt(r.time) : `<span class="tag">${t('x.pending')}</span>`}</td>
      ${state.vaults.length > 1 ? `<td>${esc(r.vaults.join(' + '))}</td>` : ''}
      <td class="${r.type === 'in' ? 'up' : r.type === 'out' ? 'down' : 'muted'}">${t('x.' + r.type)}</td>
      <td class="r m ${cls(r.net)}">${r.net > 0 ? '+' : '−'}${btc(Math.abs(r.net))}${r.fee && r.type !== 'in' ? `<div class="s">${t('x.fee', { v: nf(r.fee) + ' sats' })}</div>` : ''}</td>
      <td class="r m">${p ? brl(Math.abs(r.net) / 1e8 * p) : '—'}</td>
      <td><a href="${ex}${r.txid}" target="_blank" rel="noopener noreferrer">${r.txid.slice(0, 8)}…${r.txid.slice(-6)} ↗</a></td>
    </tr>`;
  }).join('');
  return `<div class="stag">${esc(bankName())}</div><h1 class="stitle">${t('x.title')}</h1><p class="slead">${t('x.lead')}</p>
    <div class="sec"><div class="sec-head">
      ${state.vaults.length > 1 ? `<select class="select" data-in="xfilter" style="max-width:280px">${opts}</select>` : '<span></span>'}
      <span class="sec-note">${t('x.count', { n: nf(rows.length) })}${rt.histLoading ? ' · <span class="spin" style="display:inline-block;vertical-align:-3px"></span>' : ''}</span></div>
    ${rows.length ? `<div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('x.date')}</th>${state.vaults.length > 1 ? `<th>${t('x.vault')}</th>` : ''}<th>${t('x.type')}</th><th class="r">${t('x.amount')}</th><th class="r">${t('x.brl')}</th><th>${t('x.tx')}</th></tr></thead><tbody>${body}</tbody></table></div>`
      : `<div class="empty"><p>${t('x.none')}</p></div>`}
    </div>`;
}

/* ═════════ EVOLUÇÃO ═════════ */
async function ensureHist(fromSec) {
  if (rt.hist && rt.histFrom <= fromSec) return rt.hist;
  if (rt.histLoading) return rt.histLoading;
  rt.histErr = false;
  rt.histLoading = E.btcHistory(fromSec).then(h => { rt.hist = h; rt.histFrom = fromSec; return h; })
    .catch(() => { rt.histErr = true; return null; })
    .finally(() => { rt.histLoading = false; });
  return rt.histLoading;
}
function viewEvolucao() {
  const ledger = mergedLedger().filter(r => r.time);
  const head = `<div class="stag">${esc(bankName())}</div><h1 class="stitle">${t('e.title')}</h1><p class="slead">${t('e.lead')}</p>`;
  if (!ledger.length) return head + `<div class="sec empty"><img src="assets/img/black-sheep.webp" alt="" width="140" height="140"><p>${t('e.noData')}</p>${state.vaults.length ? '' : `<div class="acts"><button class="btn-p" data-act="addvault">${t('empty.add')}</button></div>`}</div>`;
  const first = Math.min(...ledger.map(r => r.time));
  if (!rt.hist || rt.histFrom > first) {
    if (rt.histErr) return head + `<div class="sec note warn">${t('e.fail')} <button class="link-btn" data-act="retryhist">↻</button></div>`;
    ensureHist(first).then(h => h && rt.view === 'evolucao' && renderView());
    return head + `<div class="sec loading"><span class="spin"></span>${t('e.loading')}</div>`;
  }
  if (!rt.ind || !rt.live) return head + `<div class="sec loading"><span class="spin"></span>${t('e.loading')}</div>`;
  const ev = E.evolution(ledger.map(r => [r.txid, r.time, r.net, r.fee, r.type]), rt.hist, rt.live);
  rt.ev = ev;
  if (!ev) return head + `<div class="sec empty"><p>${t('e.noData')}</p></div>`;
  const lastM = monthName(E.lastMonth('ipca'));
  const card = (l, v, s, c = '') => `<div class="card ${c}"><div class="card-label">${l}</div><div class="card-value">${v}</div>${s ? `<div class="card-sub">${s}</div>` : ''}</div>`;
  const rel = x => x == null || !isFinite(x) ? '—' : `<span class="${cls(x)}">${pct(x * 100)}</span>`;
  const flows = ev.flows.slice().reverse().slice(0, 300).map(f => {
    const ret = f.sats > 0 ? (rt.live.brl / f.brl - 1) * 100 : null;
    return `<tr><td class="m">${dt(f.t)}</td><td class="${f.sats > 0 ? 'up' : 'down'}">${t(f.sats > 0 ? 'x.in' : (f.type === 'self' ? 'x.self' : 'x.out'))}</td>
      <td class="r m">${nf(Math.abs(f.sats) / 1e8, 8)}</td><td class="r m">${brl(f.brl)}<div class="s">${usd(f.usd)}</div></td>
      <td class="r m">${brl(f.valBrl)}</td><td class="r m ${cls(ret)}">${ret == null ? '—' : pct(ret, 0)}</td></tr>`;
  }).join('');
  return head + `
    <div class="sec grid g4">
      ${card(t('e.avg'), brl(ev.avgBrl), usd(ev.avgUsd))}
      ${card(t('e.in'), brl(ev.inBrl), t('e.inSub'))}
      ${card(t('e.ipcaAdj'), brl(ev.ipcaEq), t('e.ipcaAdjSub'))}
      ${card(t('e.now'), brl(ev.nowBrl), btc(ev.holdBtc * 1e8), 'hl')}
    </div>
    <div class="sec grid g4">
      ${card(t('e.real'), rel(ev.realGain), t('e.altSub', { v: brl(ev.ipcaEq) }), 'hl')}
      ${card(t('e.vsCdi'), rel(ev.vsCdi), t('e.altSub', { v: brl(ev.cdiEq) }))}
      ${card(t('e.vsPoup'), rel(ev.poupEq > 0 ? ev.nowBrl / ev.poupEq - 1 : null), t('e.altSub', { v: brl(ev.poupEq) }))}
      ${card(t('e.vsUsd'), rel(ev.usdEq > 0 ? ev.nowBrl / ev.usdEq - 1 : null), t('e.altSub', { v: brl(ev.usdEq) }))}
    </div>
    <div class="sec chart-card">
      <div class="sec-head"><div class="sec-title">${t('e.chart')}</div></div>
      <div class="legend">
        <span><i style="background:#FC6701"></i>${t('e.l.btc')}</span><span><i style="background:#60a5fa"></i>${t('e.l.cdi')}</span>
        <span><i style="background:#a78bfa"></i>${t('e.l.poup')}</span><span><i style="background:#22c55e"></i>${t('e.l.usd')}</span>
        <span style="color:#ef4444"><i class="dash"></i><span style="color:var(--text)">${t('e.l.ipca')}</span></span><span><i style="background:var(--muted)"></i>${t('e.l.in')}</span>
      </div>
      <div class="chart-box"><canvas id="evo-chart" aria-label="${t('e.chart')}"></canvas></div>
    </div>
    <div class="sec"><div class="sec-head"><div class="sec-title">${t('e.flows')}</div></div>
      <div class="tbl-wrap"><table class="tbl"><thead><tr><th>${t('e.c.date')}</th><th>${t('e.c.type')}</th><th class="r">${t('e.c.btc')}</th><th class="r">${t('e.c.price')}</th><th class="r">${t('e.c.value')}</th><th class="r">${t('e.c.ret')}</th></tr></thead><tbody>${flows}</tbody></table></div></div>
    <p class="sec card-sub">${t('e.method', { m: lastM })}${ev.estimated ? ' · ' + t('e.estimated') : ''}</p>
    <div class="sec"><button class="btn-p" data-act="report">📄 ${t('p.report')}</button></div>`;
}
function chartTheme() {
  const cs = getComputedStyle(document.documentElement);
  return { text: cs.getPropertyValue('--muted').trim(), grid: cs.getPropertyValue('--border').trim(), bg: cs.getPropertyValue('--bg2').trim(), off: cs.getPropertyValue('--off').trim() };
}
const compactBRL = v => 'R$ ' + Number(v).toLocaleString(locale(), { notation: 'compact', maximumFractionDigits: 1 });
after.evolucao = () => {
  const cv = $('#evo-chart'); const ev = rt.ev; if (!cv || !ev) return;
  const th = chartTheme();
  const labels = ev.pts.map(p => new Date(p.ts).toLocaleDateString(locale(), { month: 'short', year: '2-digit', timeZone: 'UTC' }).replace('.', ''));
  const ds = (label, key, color, extra = {}) => ({ label, data: ev.pts.map(p => p[key]), borderColor: color, backgroundColor: color, borderWidth: 2, pointRadius: 0, pointHoverRadius: 4, tension: .25, ...extra });
  rt.charts.evo = new Chart(cv, {
    type: 'line',
    data: {
      labels, datasets: [
        ds(t('e.l.btc'), 'btc', '#FC6701', { fill: true, backgroundColor: 'rgba(252,103,1,.10)', borderWidth: 2.5 }),
        ds(t('e.l.cdi'), 'cdi', '#60a5fa'), ds(t('e.l.poup'), 'poup', '#a78bfa'), ds(t('e.l.usd'), 'usd', '#22c55e'),
        ds(t('e.l.ipca'), 'ipca', '#ef4444', { borderDash: [6, 5], borderWidth: 1.6 }),
        ds(t('e.l.in'), 'aportado', th.text, { stepped: true, borderWidth: 1.2, tension: 0 }),
      ],
    },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, interaction: { mode: 'index', intersect: false },
      plugins: { legend: { display: false }, tooltip: { backgroundColor: th.bg, titleColor: th.off, bodyColor: th.off, borderColor: 'rgba(252,103,1,.3)', borderWidth: 1, bodyFont: { family: 'DM Mono' }, callbacks: { label: c => ` ${c.dataset.label}: ${brl(c.parsed.y)}` } } },
      scales: {
        x: { ticks: { color: th.text, font: { family: 'DM Mono', size: 10 }, maxTicksLimit: 8, maxRotation: 0 }, grid: { display: false } },
        y: { position: 'right', ticks: { color: th.text, font: { family: 'DM Mono', size: 10 }, callback: compactBRL }, grid: { color: th.grid } },
      },
    },
  });
};

/* ═════════ MERCADO ═════════ */
function viewMercado() {
  const L = rt.live, C = rt.chain;
  const next = 1050000, rem = C ? next - C.height : null;
  const hdate = rem ? new Date(Date.now() + rem * 600e3).toLocaleDateString(locale(), { month: 'short', year: 'numeric' }).replace('.', '') : '';
  const ticker = `<div class="ticker">
    <div class="tk"><div class="tk-l">${t('m.btcusd')}</div><div class="tk-v" data-bind="usd">${L ? usd(L.usd) : '—'}</div><div class="tk-s ${cls(L?.ch)}" data-bind="ch">${L?.ch != null ? t('m.24h', { v: pct(L.ch, 2) }) : ''}</div></div>
    <div class="tk"><div class="tk-l">${t('m.btcbrl')}</div><div class="tk-v" data-bind="brl">${L ? brl(L.brl) : '—'}</div><div class="tk-s">${L ? L.src : ''}</div></div>
    <div class="tk"><div class="tk-l">${t('m.block')}</div><div class="tk-v" data-bind="height">${C ? '#' + nf(C.height) : '—'}</div><div class="tk-s">mempool.space</div></div>
    <div class="tk"><div class="tk-l">${t('m.fee')}</div><div class="tk-v" data-bind="fee">${C?.fees ? C.fees.fastestFee + ' sat/vB' : '—'}</div><div class="tk-s" data-bind="feeEco">${C?.fees ? t('m.feeSub', { v: C.fees.economyFee }) : ''}</div></div>
    <div class="tk"><div class="tk-l">${t('m.halving')}</div><div class="tk-v" data-bind="halving">${rem ? nf(rem) + ' ' + t('m.blocks') : '—'}</div><div class="tk-s" data-bind="halvingDate">${rem ? t('m.halvingSub', { d: hdate }) : ''}</div></div>
  </div>`;
  let ind = '<div class="loading"><span class="spin"></span></div>', melt = '', comp = '';
  if (rt.ind) {
    const f = E.ipcaSince('2010-01'), lm = monthName(E.lastMonth('ipca'));
    melt = `<div class="card hl"><div class="card-label">${t('m.melt')}</div>
      <div class="melt"><div><div class="mv">R$ 100</div><div class="ml">${t('m.meltA')}</div></div><div class="arrow">→</div><div><div class="mv bad">${brl(100 * f)}</div><div class="ml">${t('m.meltB')}</div></div></div>
      <p class="card-sub" style="text-align:center;margin-top:12px">${t('m.meltNote', { m: lm, p: nf((1 - 1 / f) * 100, 1) })}</p></div>`;
    const ptx = rt.ind.ptax.valores, n = ptx.length;
    const c = (l, v, s) => `<div class="card"><div class="card-label">${l}</div><div class="card-value">${v}</div><div class="card-sub">${s}</div></div>`;
    ind = `<div class="grid g3">
      ${c(t('m.ipca'), pct(E.accum('ipca', 12), 2), t('m.until', { m: monthName(E.lastMonth('ipca')) }))}
      ${c(t('m.igpm'), pct(E.accum('igpm', 12), 2), t('m.until', { m: monthName(E.lastMonth('igpm')) }))}
      ${c(t('m.cdi'), pct(E.accum('cdi', 12), 2), t('m.until', { m: monthName(E.lastMonth('cdi')) }))}
      ${c(t('m.poup'), pct(E.accum('poupanca', 12), 2), t('m.until', { m: monthName(E.lastMonth('poupanca')) }))}
      ${c(t('m.usd'), 'R$ ' + nf(ptx[n - 1], 2), t('m.usdSub', { m: monthName(E.lastMonth('ptax')), v: pct((ptx[n - 1] / ptx[n - 13] - 1) * 100, 1) }))}
      ${L ? c('BTC (R$) · 12m', `<span data-bind="btc12">${rt.hist && rt.histFrom <= Date.now() / 1000 - 3700 * 86400 ? pct(E.periodReturns(rt.hist, L, 12)?.btc, 1) : '…'}</span>`, 'CoinGecko · Bitstamp') : ''}
    </div>`;
    const periods = [[12, 'm.p1'], [36, 'm.p3'], [60, 'm.p5'], [120, 'm.p10']];
    comp = `<div class="sec chart-card">
      <div class="sec-head"><div><div class="sec-title">${t('m.comp')}</div><div class="card-sub">${t('m.compLead')}</div></div>
        <div class="seg">${periods.map(([m, k]) => `<button class="${rt.period === m ? 'active' : ''}" data-act="period" data-k="${m}">${t(k)}</button>`).join('')}</div></div>
      <div id="comp-body"><div class="loading"><span class="spin"></span>${t('e.loading')}</div></div>
    </div>`;
  }
  return `<div class="stag">${esc(state.bank ? bankName() : 'My Bank')}</div><h1 class="stitle">${t('m.title')}</h1><p class="slead">${t('m.lead')}</p>
    <div class="sec">${ticker}</div>
    <div class="sec grid g2" style="align-items:start">${melt}<div><div class="card-label" style="margin-bottom:10px">${t('m.ind')}</div>${ind}</div></div>
    ${comp}
    <p class="sec card-sub">${t('m.src', { p: 'CoinGecko, Bitstamp', c: 'mempool.space' })}</p>
    ${state.bank ? '' : `<div class="sec"><button class="btn-p" data-act="go" data-v="abrir">${t('ob.open')}</button></div>`}`;
}
after.mercado = async () => {
  if (!rt.ind || !rt.live) return;
  const from = Math.floor(Date.now() / 1000) - 3700 * 86400;
  const h = await ensureHist(from);
  if (rt.view !== 'mercado') return;
  const body = $('#comp-body'); if (!body) return;
  if (!h) { body.innerHTML = `<div class="note warn">${t('m.histFail')}</div>`; return; }
  const b12 = $('[data-bind="btc12"]'); const r12 = E.periodReturns(h, rt.live, 12); if (b12 && r12) b12.textContent = pct(r12.btc, 1);
  const r = E.periodReturns(h, rt.live, rt.period);
  if (!r) { body.innerHTML = `<div class="note warn">${t('m.histFail')}</div>`; return; }
  const rows = [['btc', '#FC6701'], ['usd', '#22c55e'], ['cdi', '#60a5fa'], ['poupanca', '#a78bfa'], ['ipca', '#ef4444']].map(([k, c]) => ({ k, c, v: r[k] })).sort((a, b) => b.v - a.v);
  const infl = r.ipca;
  body.innerHTML = `<div class="chart-box sm"><canvas id="comp-chart"></canvas></div>
    <div class="tbl-wrap" style="margin-top:16px"><table class="tbl"><thead><tr><th>${t('m.c.asset')}</th><th class="r">${t('m.c.ret')}</th><th class="r">${t('m.c.r100')}</th><th>${t('m.c.real')}</th></tr></thead><tbody>
    ${rows.map((x, i) => `<tr><td><i style="display:inline-block;width:9px;height:9px;border-radius:2px;background:${x.c};margin-right:8px"></i>${t('m.a.' + x.k)}${i === 0 ? ' 🥇' : ''}</td><td class="r m ${cls(x.v)}">${pct(x.v, 1)}</td><td class="r m">${brl(100 * (1 + x.v / 100), 2)}</td><td>${x.k === 'ipca' ? '—' : x.v > infl ? `<span class="up">${t('m.yes')}</span>` : `<span class="down">${t('m.no')}</span>`}</td></tr>`).join('')}
    </tbody></table></div>`;
  const th = chartTheme();
  rt.charts.comp = new Chart($('#comp-chart'), {
    type: 'bar',
    data: { labels: rows.map(x => t('m.a.' + x.k)), datasets: [{ data: rows.map(x => x.v), backgroundColor: rows.map(x => x.c + '40'), borderColor: rows.map(x => x.c), borderWidth: 2, borderRadius: 6 }] },
    options: {
      responsive: true, maintainAspectRatio: false, animation: false, indexAxis: 'y',
      plugins: { legend: { display: false }, tooltip: { backgroundColor: th.bg, titleColor: th.off, bodyColor: th.off, callbacks: { label: c => ' ' + pct(c.parsed.x, 1) } } },
      scales: { x: { ticks: { color: th.text, font: { family: 'DM Mono', size: 10 }, callback: v => pct(v, 0) }, grid: { color: th.grid } }, y: { ticks: { color: th.off, font: { family: 'DM Sans', size: 12 } }, grid: { display: false } } },
    },
  });
};

/* ═════════ AJUSTES ═════════ */
function viewAjustes() {
  const s = state.settings, b = state.bank;
  const server = s.api.includes('mempool.space') ? 'mempool' : s.api.includes('blockstream.info') ? 'blockstream' : 'custom';
  rt.sStyle = rt.sStyle || b.style;
  return `<div class="stag">${esc(bankName())}</div><h1 class="stitle">${t('s.title')}</h1><p class="slead">${t('s.lead')}</p>
  <div class="sec grid g2" style="align-items:start">
    <div class="card">
      <div class="field"><label for="s-name">${t('s.bank')}</label><input class="input" id="s-name" data-in="sname" maxlength="32" value="${esc(b.name)}"></div>
      <div class="styles" id="s-styles" style="margin-top:0">${styleChips(b.name, rt.sStyle, 'sstyle')}</div>
      <button class="btn-p btn-s" data-act="savename" style="margin-top:12px">${t('s.save')}</button>
      <div class="set-row" style="margin-top:12px"><div class="set-t">${t('s.lang')}</div><div class="seg"><button class="${lang() === 'pt' ? 'active' : ''}" data-act="setlang" data-k="pt">Português</button><button class="${lang() === 'en' ? 'active' : ''}" data-act="setlang" data-k="en">English</button></div></div>
      <div class="set-row"><div class="set-t">${t('s.theme')}</div><div class="seg"><button class="${(prefs.theme || 'dark') === 'dark' ? 'active' : ''}" data-act="settheme" data-k="dark">${t('s.dark')}</button><button class="${prefs.theme === 'light' ? 'active' : ''}" data-act="settheme" data-k="light">${t('s.light')}</button></div></div>
      <div class="set-row"><div><div class="set-t">${t('s.remember')}</div><div class="set-d">${t('s.rememberD')}</div></div><label class="switch"><input type="checkbox" data-act="remember" ${s.remember ? 'checked' : ''}><span></span></label></div>
    </div>
    <div class="card">
      <div class="set-t">${t('s.server')}</div><div class="set-d" style="margin-bottom:14px">${t('s.serverD')}</div>
      <div class="seg" style="margin-bottom:14px"><button class="${server === 'mempool' ? 'active' : ''}" data-act="server" data-k="https://mempool.space/api">mempool.space</button><button class="${server === 'blockstream' ? 'active' : ''}" data-act="server" data-k="https://blockstream.info/api">blockstream.info</button><button class="${server === 'custom' ? 'active' : ''}" data-act="servercustom">${t('s.custom')}</button></div>
      <div class="${server === 'custom' || rt.server === 'custom' ? '' : 'hidden'}" id="custom-box"><div class="open-row"><input class="input" id="s-api" placeholder="${t('s.customPh')}" value="${server === 'custom' ? esc(s.api) : ''}" spellcheck="false"><button class="btn-g" data-act="testapi">${t('s.test')}</button></div></div>
      <p class="card-sub mono" style="margin-top:10px">${esc(s.api)}</p>
    </div>
    <div class="card">
      <div class="set-t">${t('s.backup')}</div><div class="set-d" style="margin-bottom:14px">${t('s.backupD')}</div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn-p btn-s" data-act="export">⬇ ${t('s.export')}</button><button class="btn-g btn-s" data-act="import">⬆ ${t('s.import')}</button></div>
    </div>
    <div class="card">
      <div class="set-t" style="margin-bottom:10px">${t('s.privacy')}</div>
      <ul class="steps" style="margin-top:0">${t('s.privacyList').map(x => `<li class="done"><span class="st">✓</span><span>${x}</span></li>`).join('')}</ul>
    </div>
    <div class="card" style="border-color:rgba(239,68,68,.3)">
      <div class="set-t">${t('s.close')}</div><div class="set-d" style="margin-bottom:14px">${t('s.closeD')}</div>
      <button class="btn-g btn-s btn-danger" data-act="closebank">${t('s.closeBtn')}</button>
    </div>
  </div>`;
}

/* ═════════ MODAIS E TOAST ═════════ */
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 4200);
}
function modal(html) {
  return new Promise(resolve => {
    const m = $('#modal'), c = $('#modal-card');
    c._validate = null; c.innerHTML = html; m.classList.add('show');
    const done = v => { m.classList.remove('show'); c.innerHTML = ''; m.onclick = null; document.removeEventListener('keydown', key); resolve(v); };
    const key = e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target.matches('input')) $('[data-m="ok"]', c)?.click(); };
    document.addEventListener('keydown', key);
    m.onclick = e => {
      if (e.target === m) return done(null);
      const b = e.target.closest('[data-m]'); if (!b) return;
      if (b.dataset.m === 'cancel') return done(null);
      const vals = Object.fromEntries($$('input', c).map(i => [i.name, i.value]));
      const err = c._validate?.(vals);
      if (err) { $('.m-err', c).textContent = err; return; }
      done(vals);
    };
    setTimeout(() => $('input', c)?.focus(), 50);
  });
}
const mBtns = (ok, danger) => `<p class="m-err down" style="font-size:12px;margin:0 0 8px"></p><div class="modal-acts"><button class="btn-g btn-s" data-m="cancel">${t('cancel')}</button><button class="btn-p btn-s ${danger ? 'btn-danger' : ''}" data-m="ok" ${danger ? 'style="background:var(--red);color:#fff"' : ''}>${ok}</button></div>`;
const confirmBox = (title, text, ok, danger) => modal(`<h3>${title}</h3><p>${text}</p>${mBtns(ok, danger)}`);

async function doExport() {
  const p = modal(`<h3>${t('bk.passT')}</h3><p>${t('bk.passX')}</p>
    <div class="field"><label>${t('bk.pass')}</label><input class="input" type="password" name="a" autocomplete="new-password"></div>
    <div class="field"><label>${t('bk.pass2')}</label><input class="input" type="password" name="b" autocomplete="new-password"></div>${mBtns(t('bk.go'))}`);
  $('#modal-card')._validate = v => v.a.length < 8 ? t('err.passShort') : v.a !== v.b ? t('err.passMatch') : null;
  const r = await p; if (!r) return;
  const data = await S.exportBackup(state, r.a);
  const slug = state.bank.name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'banco';
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = `mybank-${slug}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  toast(t('bk.ok'));
}
function doImport() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files?.[0]; if (!f || f.size > 2e6) return;
    const text = await f.text();
    const p = modal(`<h3>${t('bk.openT')}</h3><p>${t('bk.openX')}</p><div class="field"><label>${t('bk.pass')}</label><input class="input" type="password" name="a" autocomplete="current-password"></div>${mBtns(t('bk.open'))}`);
    const r = await p; if (!r) return;
    try {
      state = await S.importBackup(text, r.a);
      persist(); toast(t('bk.imported'));
      go('painel'); renderTop(); scanAll();
    } catch (e) { toast(t(e.message)); }
  };
  inp.click();
}

/* ═════════ BALANÇO (impressão) ═════════ */
function printReport() {
  const T = totals(), L = rt.live, ev = rt.ev;
  const rows = mergedLedger().filter(r => r.time).sort((a, b) => b.time - a.time).slice(0, 25);
  $('#print-report').innerHTML = `
    <div class="pr-top"><div><div class="pr-tag">${t('r.title').toUpperCase()}</div><h1>${esc(bankName())}</h1><div style="font-size:11px;color:#555">${T.tip ? t('r.date', { d: new Date().toLocaleString(locale()), h: nf(T.tip) }) : new Date().toLocaleString(locale())}</div></div><img src="assets/img/logo-bsafe.png" alt="BSafe Bitcoin"></div>
    <h2>${t('r.res')}</h2>
    <div class="pr-grid">
      <div class="pr-box"><div class="pr-l">BTC</div><div class="pr-v">${nf(T.sats / 1e8, 8)}</div></div>
      <div class="pr-box"><div class="pr-l">BRL</div><div class="pr-v">${L ? brl(T.sats / 1e8 * L.brl, 2) : '—'}</div></div>
      <div class="pr-box"><div class="pr-l">USD</div><div class="pr-v">${L ? usd(T.sats / 1e8 * L.usd, 2) : '—'}</div></div>
    </div>
    <h2>${t('r.vaults')}</h2>
    <table><thead><tr><th>${t('x.vault')}</th><th>${t('x.type')}</th><th>${t('x.amount')}</th><th></th></tr></thead><tbody>
      ${state.vaults.map(v => `<tr><td>${esc(v.label)}</td><td>${v.kind === 'multisig' ? t('v.multi', { m: v.cfg.m, n: v.cfg.keys.length }) + ' multisig' : 'single-sig'}</td><td>${v.scan ? btc(v.scan.sats) : '—'}</td><td>${v.scan ? t('v.verified', { h: nf(v.scan.tip), t: new Date(v.scan.scannedAt).toLocaleString(locale()) }) : ''}</td></tr>`).join('')}
    </tbody></table>
    ${ev ? `<h2>${t('r.evo')}</h2><div class="pr-grid">
      <div class="pr-box"><div class="pr-l">${t('e.avg')}</div><div class="pr-v">${brl(ev.avgBrl)}</div></div>
      <div class="pr-box"><div class="pr-l">${t('e.in')}</div><div class="pr-v">${brl(ev.inBrl)}</div></div>
      <div class="pr-box"><div class="pr-l">${t('e.ipcaAdj')}</div><div class="pr-v">${brl(ev.ipcaEq)}</div></div>
      <div class="pr-box"><div class="pr-l">${t('e.real')}</div><div class="pr-v">${ev.realGain == null ? '—' : pct(ev.realGain * 100)}</div></div>
      <div class="pr-box"><div class="pr-l">${t('e.vsCdi')}</div><div class="pr-v">${ev.vsCdi == null ? '—' : pct(ev.vsCdi * 100)}</div></div>
      <div class="pr-box"><div class="pr-l">${t('p.level')}</div><div class="pr-v">${levelInfo().lv}/5 · ${t('lv.' + levelInfo().lv)}</div></div></div>` : ''}
    <h2>${t('r.flows')}</h2>
    <table><thead><tr><th>${t('x.date')}</th><th>${t('x.type')}</th><th>${t('x.amount')}</th><th>TXID</th></tr></thead><tbody>
      ${rows.map(r => `<tr><td>${dt(r.time)}</td><td>${t('x.' + r.type)}</td><td>${r.net > 0 ? '+' : '−'}${btc(Math.abs(r.net))}</td><td style="font-family:'DM Mono',monospace;font-size:8px">${r.txid}</td></tr>`).join('')}
    </tbody></table>
    <div class="pr-foot">${t('r.foot')}</div>`;
  setTimeout(() => window.print(), 150);
}

/* ═════════ AÇÕES ═════════ */
const ACT = {
  go: el => go(el.dataset.v),
  lang: () => { prefs.lang = lang() === 'pt' ? 'en' : 'pt'; S.savePrefs(prefs); applyLang(); renderAll(); },
  setlang: el => { prefs.lang = el.dataset.k; S.savePrefs(prefs); applyLang(); renderAll(); },
  theme: () => { prefs.theme = (prefs.theme || 'dark') === 'dark' ? 'light' : 'dark'; S.savePrefs(prefs); applyTheme(); renderView(); },
  settheme: el => { prefs.theme = el.dataset.k; S.savePrefs(prefs); applyTheme(); renderView(); },
  obstyle: el => { rt.obStyle = el.dataset.k; $('#ob-styles').innerHTML = styleChips(rt.obName, rt.obStyle, 'obstyle'); $('#facade').innerHTML = facadeHTML(); },
  open: () => {
    const name = ($('#ob-name')?.value || '').trim();
    if (!name) { toast(t('err.name')); $('#ob-name')?.focus(); return; }
    state.bank = { name, style: rt.obStyle, opened: Date.now(), block: rt.chain?.height || null };
    persist(); toast(t('toast.opened', { bank: bankName() }));
    renderTop(); go('painel');
  },
  import: () => doImport(),
  export: () => doExport(),
  addvault: () => { rt.addOpen = true; go('cofres'); setTimeout(() => $('#addform')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60); },
  kind: el => { rt.addKind = el.dataset.k; const l = $('#v-label')?.value; renderView(); if (l) $('#v-label').value = l; },
  addsubmit: () => addVault(),
  scan: el => scanVault(el.dataset.id),
  scanall: () => scanAll(),
  rename: async el => {
    const v = state.vaults.find(x => x.id === el.dataset.id); if (!v) return;
    const r = await modal(`<h3>${t('v.rename')}</h3><div class="field"><label>${t('v.renameQ')}</label><input class="input" name="n" maxlength="40" value="${esc(v.label)}"></div>${mBtns(t('s.save'))}`);
    if (r?.n?.trim()) { v.label = r.n.trim(); persist(); renderView(); }
  },
  remove: async el => {
    const v = state.vaults.find(x => x.id === el.dataset.id); if (!v) return;
    if (!(await confirmBox(t('v.remove'), t('v.removeQ', { n: esc(v.label) }), t('v.remove'), true))) return;
    state.vaults = state.vaults.filter(x => x !== v); rt.ev = null; persist(); renderView();
  },
  firstaddr: async el => {
    const v = state.vaults.find(x => x.id === el.dataset.id); if (!v) return;
    let a = '—';
    try { a = W.makeDeriver({ ...v.cfg, addrType: v.cfg.addrType || v.scan?.addrType || 'p2wpkh' })(0, 0); } catch {}
    await modal(`<h3>${t('v.firstAddrT')}</h3><p>${t('v.firstAddrX')}</p><div class="textarea" style="min-height:0;word-break:break-all;font-size:14px;color:var(--btc);user-select:all">${a}</div><div class="modal-acts" style="margin-top:16px"><button class="btn-p btn-s" data-m="cancel">${t('close')}</button></div>`);
  },
  check: el => { state.checks[el.dataset.k] = el.checked; persist(); setTimeout(() => renderView(), 120); },
  keytest: () => { state.checks.keyTest = Date.now(); persist(); renderView(); toast(t('toast.saved')); },
  learn: el => { rt.learnIdx = +el.dataset.k; renderView(); },
  period: el => { rt.period = +el.dataset.k; renderView(); },
  retryhist: () => { rt.histErr = false; renderView(); },
  report: () => printReport(),
  sstyle: el => { rt.sStyle = el.dataset.k; $('#s-styles').innerHTML = styleChips($('#s-name').value, rt.sStyle, 'sstyle'); },
  savename: () => { const n = $('#s-name').value.trim(); if (!n) return toast(t('err.name')); state.bank.name = n; if (rt.sStyle) state.bank.style = rt.sStyle; persist(); renderTop(); renderView(); toast(t('toast.saved')); },
  remember: el => { state.settings.remember = el.checked; persist(); toast(t('toast.saved')); },
  server: el => { state.settings.api = el.dataset.k; rt.server = null; persist(); renderView(); toast(t('toast.server')); },
  servercustom: () => { rt.server = 'custom'; $('#custom-box')?.classList.remove('hidden'); $('#s-api')?.focus(); },
  testapi: async () => {
    let u = ($('#s-api').value || '').trim().replace(/\/+$/, '');
    if (!/^https:\/\//.test(u)) return toast(t('toast.serverFail'));
    try {
      const h = await fetch(u + '/blocks/tip/height', { signal: AbortSignal.timeout(8000) }).then(r => r.text());
      if (!(+h > 800000)) throw 0;
      state.settings.api = u; persist(); renderView(); toast(t('toast.server') + ' #' + nf(+h));
    } catch { toast(t('toast.serverFail')); }
  },
  closebank: async () => {
    if (!(await confirmBox(t('s.close'), t('s.closeQ', { bank: esc(bankName()) }), t('s.closeBtn'), true))) return;
    S.wipe(); state = S.blankState(); rt.ev = null; rt.hist = null; rt.histFrom = Infinity;
    renderTop(); go('abrir');
  },
};
document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  if (el.type === 'checkbox') return; // tratado em change
  ACT[el.dataset.act]?.(el, e);
});
document.addEventListener('change', e => {
  const el = e.target;
  if (el.matches('input[type=checkbox][data-act]')) ACT[el.dataset.act]?.(el, e);
  if (el.dataset.in === 'xfilter') { rt.xFilter = el.value; renderView(); }
});
let pvTimer;
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.in === 'obname') {
    rt.obName = el.value; const f = $('#facade-name');
    if (f) f.textContent = el.value.trim() ? bankName({ name: el.value, style: rt.obStyle }) : (lang() === 'pt' ? "Seu nome's Bank" : "Your name's Bank");
    const c = $('#ob-styles'); if (c) c.innerHTML = styleChips(el.value, rt.obStyle, 'obstyle');
  }
  if (el.id === 's-name') { const c = $('#s-styles'); if (c) c.innerHTML = styleChips(el.value, rt.sStyle, 'sstyle'); }
  if (el.dataset.in === 'vinput') { clearTimeout(pvTimer); pvTimer = setTimeout(previewInput, 250); }
});
document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && e.target.id === 'ob-name') ACT.open();
});

/* ═════════ DADOS AO VIVO ═════════ */
function bindLive() {
  const L = rt.live, C = rt.chain, T = totals();
  const set = (k, v) => $$(`[data-bind="${k}"]`).forEach(e => { e.textContent = v; });
  if (L) {
    set('usd', usd(L.usd)); set('brl', brl(L.brl));
    if (L.ch != null) set('ch', t('m.24h', { v: pct(L.ch, 2) }));
    set('resBrl', brl(T.sats / 1e8 * L.brl)); set('resUsd', usd(T.sats / 1e8 * L.usd));
  }
  if (C) {
    set('height', '#' + nf(C.height));
    if (C.fees) { set('fee', C.fees.fastestFee + ' sat/vB'); set('feeEco', t('m.feeSub', { v: C.fees.economyFee })); }
    const rem = 1050000 - C.height; set('halving', nf(rem) + ' ' + t('m.blocks'));
  }
}
async function tickLive(first) {
  const [L, C] = await Promise.allSettled([E.livePrice(state.settings.api), E.chainInfo(state.settings.api)]);
  const hadLive = !!rt.live;
  if (L.status === 'fulfilled') rt.live = L.value;
  if (C.status === 'fulfilled') rt.chain = C.value;
  if (first || !hadLive) { if (!document.activeElement?.matches?.('input,textarea')) renderView(); else bindLive(); }
  else bindLive();
}

/* ═════════ INÍCIO ═════════ */
async function init() {
  applyLang(); applyTheme();
  const h = (location.hash || '').slice(1);
  rt.view = state.bank ? (TABS[h] ? h : 'painel') : (h === 'mercado' ? 'mercado' : 'abrir');
  renderAll();
  E.loadIndicators().then(ind => { rt.ind = ind; if (!document.activeElement?.matches?.('input,textarea')) renderView(); }).catch(() => {});
  tickLive(true);
  setInterval(() => { if (!document.hidden) tickLive(false); }, 60000);
  // prova de reservas automática se a última verificação tem mais de 1 hora
  if (state.bank && state.vaults.some(v => !v.scan || Date.now() - v.scan.scannedAt > 3600e3)) setTimeout(scanAll, 800);
}
init();
