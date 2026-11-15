// Loftia Dashboard - website. Screens, dialogs and actions.
import * as db from './db.js';
import {
  Model, GROUPS, TASK_GROUPS, RARITIES, CATEGORIES, CATEGORY_GROUP, CATALOG_INDEX, ALL_CATALOG_NAMES,
  key, splitKey, slugify, normName, iconUrl, itemUrl, todayISO, addDays, daysBetween, shortDate, prettyDate,
  rangeText, readInventoryCSV, toCSV, readBackupJSON, makeBackupJSON,
} from './logic.js';
import { BIN_INFO, EFFORTS, BIN_PAGES, RECIPE_BOOK } from './gamedata.js';

// ───────── small helpers ─────────
const root = document.getElementById('root');
const $ = (sel, el = document) => el.querySelector(sel);
const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString();
const plural = (n, word, many = word + 's') => `${fmt(n)} ${n === 1 ? word : many}`;
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

const GROUP_COLORS = {
  'Floating Village': ['var(--blue)', 'var(--blue-soft)'], 'Global Village': ['var(--orange-dk)', 'var(--orange-soft)'],
  Museum: ['var(--lav)', 'var(--lav-soft)'], 'Cooking Ingredients': ['var(--green)', 'var(--green-soft)'],
};
const CAT_TAG = { Materials: '', Crops: 'green', Foods: 'orange', Fishes: 'blue', Flowers: 'berry', Artifacts: 'lav', Other: '' };
const RARITY_TAG = { Common: '', Uncommon: 'green', Rare: 'blue', 'Very rare': 'lav', Epic: 'lav', Legendary: 'orange' };
const RARITY_STARS = { Uncommon: ['\u2605', '#5BC8D8'], Rare: ['\u2605\u2605', '#5BC8D8'], 'Very rare': ['\u2605\u2605', '#F2B632'], Epic: ['\u2605\u2605', '#F2B632'], Legendary: ['\u2605\u2605\u2605', '#F2B632'] };
const NAV = [
  ['Overview', ['Dashboard', 'My Items', 'Shopping List', 'All Items']],
  ['Villages', [...GROUPS]],
  ['Planning', ['Task List', 'Contribution Bins', 'Daily Schedule', 'Recipes']],
];
const NAV_ICONS = {
  Dashboard: 'Spotless Game Guy', 'My Items': 'Gears', 'Shopping List': 'Golden Chest Key', 'All Items': 'Used Rubber Duck',
  'Floating Village': 'Rainbow Trout', 'Global Village': 'Potato Soup', Museum: 'Used Boombox', 'Cooking Ingredients': 'Carrot',
  'Task List': "Used Gone Fishin'", 'Contribution Bins': 'Carrot Cake', 'Daily Schedule': 'Fried Eggs', Recipes: 'Cooking Station',
};
const SUBTITLES = {
  Dashboard: 'Your event week at a glance', 'My Items': 'Everything you own \u2013 search, filter and update any count',
  'Shopping List': 'Everything you still need to collect, cook or grow', 'All Items': 'Every item the current bins and recipes use',
  'Floating Village': 'Fish and critters for the village bins', 'Global Village': 'Dishes to cook and contribute',
  Museum: 'Toys and artifacts for the museum', 'Cooking Ingredients': 'Raw ingredients \u2013 targets follow the dishes you still need',
  'Task List': 'Where to go next for fish and museum artifacts, most urgent first',
  'Contribution Bins': 'What each bin wants \u2013 mark a bin done to take its items out of your bag',
  'Daily Schedule': 'Bin requests, day by day', Recipes: 'What every dish needs',
};
const LIST_VIEWS = ['Shopping List', 'All Items', ...GROUPS];

/** <img> for an item, with a lettered tile if the picture can't load */
function icon(name, size = 28, group = null, cls = 'icon') {
  const [fg, bg] = GROUP_COLORS[group] || ['var(--muted)', '#F3E9DC'];
  return `<img class="${cls}" src="${iconUrl(name)}" width="${size}" height="${size}" alt="" loading="lazy" decoding="async"
    data-fb="${esc((name[0] || '?').toUpperCase())}" data-fg="${fg}" data-bg="${bg}" style="width:${size}px;height:${size}px">`;
}
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.dataset.fb) return;
  const s = document.createElement('span');
  s.className = 'ph ' + img.className;
  s.textContent = img.dataset.fb;
  s.style.cssText = `${img.style.cssText};background:${img.dataset.bg};color:${img.dataset.fg};font-size:${parseInt(img.style.width) * 0.45}px`;
  img.replaceWith(s);
}, true);
function tileIcon(name, size, group) {
  const [, bg] = GROUP_COLORS[group] || ['', '#F6EEE3'];
  return `<div class="tile-ico" style="width:${size}px;height:${size}px;background:${bg}">${icon(name, Math.round(size * 0.72), group, 'icon')}</div>`;
}
const groupOfCat = (cat) => CATEGORY_GROUP[cat] || null;
const catOfName = (name) => (CATALOG_INDEX.get(normName(name)) || ['', 'Other'])[1];
function rarityTag(r) { return r ? `<span class="tag ${RARITY_TAG[r] || ''}">${esc(r)}</span>` : ''; }

// ───────── state ─────────
const saved = JSON.parse(localStorage.getItem('loftia-ui') || '{}');
const S = {
  session: null, model: null, finds: [], updating: false, updateError: null, menu: false,
  view: saved.view || 'Dashboard',
  ui: Object.assign({
    search: '', method: 'All', missingOnly: false, sort: ['name', 1], sel: {},
    db: { search: '', owned: true, cat: 'All', sort: 'az', sel: null },
    binDay: null, taskFilter: 'All', schedDay: 'All', hideDone: false,
  }, saved.ui || {}),
};
S.ui.search = ''; S.ui.db.search = '';
const persist = () => localStorage.setItem('loftia-ui', JSON.stringify({ view: S.view, ui: S.ui }));

// ───────── toast & dialogs ─────────
let toastTimer;
function toast(text, icn = '\u2713') {
  $('.toast')?.remove();
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = `${icn}  ${text}`;
  document.body.appendChild(t);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.remove(), 2800 + 35 * text.length);
}
function modal({ title, sub = '', body = '', foot = '', wide = false, dismiss = true }) {
  const ov = document.createElement('div');
  ov.className = 'overlay';
  ov.innerHTML = `<div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
    <div class="mhead"><h3>${esc(title)}</h3>${sub ? `<div class="muted small">${sub}</div>` : ''}</div>
    <div class="mbody">${body}</div><div class="mfoot">${foot}</div></div>`;
  document.body.appendChild(ov);
  const prev = document.activeElement;
  let onClose = () => {};
  const close = (v) => { ov.remove(); document.removeEventListener('keydown', key); prev?.focus?.(); onClose(v); };
  const key = (e) => { if (e.key === 'Escape' && dismiss) { e.preventDefault(); close(null); } };
  document.addEventListener('keydown', key);
  if (dismiss) ov.addEventListener('mousedown', (e) => { if (e.target === ov) close(null); });
  return { el: ov, close, set onClose(fn) { onClose = fn; } };
}
function confirmBox(title, text, ok = 'OK', cancel = 'Cancel') {
  return new Promise((res) => {
    const m = modal({
      title, body: `<p style="white-space:pre-line;margin:0 0 6px">${esc(text)}</p>`,
      foot: `${cancel ? `<button class="btn" data-x="no">${esc(cancel)}</button>` : ''}<button class="btn primary" data-x="yes">${esc(ok)}</button>`,
    });
    m.onClose = (v) => res(!!v);
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) m.close(b.dataset.x === 'yes'); });
    $('[data-x="yes"]', m.el).focus();
  });
}
const infoBox = (title, text) => confirmBox(title, text, 'OK', '');
function askAmount({ title, prompt, initial = 1, min = 0, max = null, item = null }) {
  return new Promise((res) => {
    const m = modal({
      title,
      body: `<div style="display:flex;gap:12px;align-items:center">${item ? tileIcon(item.name, 52, item.group) : ''}
        <div style="font-weight:700">${esc(prompt)}</div></div>
        <input class="qty-input" style="margin-top:14px" type="number" inputmode="numeric" min="${min}" ${max != null ? `max="${max}"` : ''} value="${initial}">
        <div class="tiny muted err" style="margin-top:6px">Press Enter to save</div>`,
      foot: '<button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes">Save</button>',
    });
    const inp = $('input', m.el);
    const ok = () => {
      const n = Number(inp.value);
      if (!Number.isInteger(n) || n < min || (max != null && n > max)) {
        const e = $('.err', m.el);
        e.textContent = max != null ? `Enter a whole number from ${min} to ${max}.` : `Enter a whole number of ${min} or more.`;
        e.style.color = 'var(--berry)';
        return;
      }
      m.close(n);
    };
    m.onClose = (v) => res(v == null || v === false ? null : v);
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (!b) return; b.dataset.x === 'yes' ? ok() : m.close(null); });
    inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
    inp.focus(); inp.select();
  });
}

// ───────── data changes (optimistic: screen updates first, server second) ─────────
function rebuild() { S.model.recalc(todayISO()); }
async function reloadAll() {
  const d = await db.loadAll();
  const data = d.requests || (await (await fetch('data/seed.json')).json());
  S.model = new Model(data);
  S.model.setState({ inventory: d.inventory, completions: d.completions });
  S.finds = d.finds;
}
async function safely(fn, failMsg) {
  try { await fn(); } catch (e) {
    await infoBox('That didn\u2019t save', `${failMsg}\n\n${e.message}\n\nYour screen has been refreshed with what\u2019s saved.`);
    await reloadAll(); render();
  }
}
/** changes: [{item_key, have}] */
async function setCounts(changes, msg) {
  for (const c of changes) S.model.have.set(c.item_key, Math.max(0, c.have));
  rebuild(); renderKeepScroll();
  if (msg) toast(msg);
  await safely(() => db.setInventory(changes.map((c) => ({ item_key: c.item_key, have: Math.max(0, c.have) }))), 'Your change couldn\u2019t be saved.');
}

// ───────── shell ─────────
function render() {
  if (!db.configured) { root.innerHTML = setupScreen(); return; }
  if (!S.session) { root.innerHTML = signInScreen(); return; }
  if (!S.model) { root.innerHTML = '<div class="loading">Loading your items…</div>'; return; }
  root.innerHTML = `<div class="app ${S.menu ? 'menu-open' : ''}">${sidebar()}<main class="main">${topbar()}<div id="view"></div></main></div>`;
  renderView();
}
function renderKeepScroll() {
  const keep = { win: scrollY };
  const tc = $('.table-card'); if (tc) keep.table = tc.scrollTop;
  render();
  scrollTo(0, keep.win);
  const tc2 = $('.table-card'); if (tc2 && keep.table) tc2.scrollTop = keep.table;
}
function sidebar() {
  const m = S.model;
  const shop = m.items.filter((i) => m.missing(i) > 0).length;
  const binsLeft = m.openBins(todayISO()).length;
  const tasks = m.buildTasks().length;
  const badges = { 'Shopping List': shop, 'Contribution Bins': binsLeft, 'Task List': tasks };
  const nav = NAV.map(([g, views]) => `<div class="nav-group">${g}</div>` + views.map((v) => `
    <button class="nav-btn ${S.view === v ? 'on' : ''}" data-act="nav" data-v="${esc(v)}">${icon(NAV_ICONS[v], 24, GROUPS.includes(v) ? v : null)}
      <span>${esc(v)}</span>${badges[v] ? `<span class="badge">${badges[v]}</span>` : ''}</button>`).join('')).join('');
  const ds = m.dates();
  return `<aside class="side"><div class="logo" aria-label="Loftia">Loftia</div>
    <div class="logo-sub">Inventory &amp; shopping dashboard</div><nav>${nav}</nav>
    <div class="side-foot"><div class="row"><span class="dot"></span><b>Saved to your account</b></div>
      <div class="muted">${ds.length ? `Requests ${rangeText(ds[0], ds[ds.length - 1])}` : 'No requests loaded'}</div>
      <div class="muted tiny" style="margin-top:6px">${esc(updatedText())}</div>
      <div class="muted tiny" style="margin-top:8px">${esc(S.session.user.email || '')} \u00b7 <button class="linkish tiny" data-act="signout">Sign out</button></div>
      <div class="muted tiny" style="margin-top:4px">Item art from loftiacodex.com</div></div></aside>`;
}
function topbar() {
  return `<div class="topbar"><button class="btn menu-btn" data-act="menu" aria-label="Menu">\u2630</button>
    <div><h1>${esc(S.view)}</h1><div class="sub">${esc(SUBTITLES[S.view] || '')}</div></div>
    <div class="actions">
      <button class="btn" data-act="update" ${S.updating ? 'disabled' : ''}>${S.updating ? 'Checking loftiacodex.com\u2026' : '\u21bb Update requests'}</button>
      <button class="btn" data-act="import">Import CSV</button>
      <button class="btn" data-act="backups">Backups</button>
      <button class="btn primary" data-act="export">Export CSV</button></div></div>`;
}
function updatedText() {
  if (S.updating) return 'Checking loftiacodex.com for new requests\u2026';
  if (S.updateError) return `Last update failed at ${S.updateError.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} \u00b7 showing saved requests`;
  const at = S.model?.data?.updated_at;
  if (!at) return 'Using the built-in list \u2013 press Update requests';
  const d = new Date(at), t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = todayISO(d), today = todayISO();
  if (day === today) return `Updated today at ${t}`;
  if (day === addDays(today, -1)) return `Updated yesterday at ${t}`;
  return `Updated ${shortDate(day)}`;
}
function renderView() {
  const v = $('#view');
  const views = {
    Dashboard: viewDashboard, 'My Items': viewMyItems, 'Task List': viewTasks, 'Contribution Bins': viewBins,
    'Daily Schedule': viewSchedule, Recipes: viewRecipes,
  };
  v.innerHTML = (views[S.view] || viewList)();
  if (S.view === 'My Items') fillMyItems();
  if (LIST_VIEWS.includes(S.view)) fillList();
}

// ───────── Dashboard ─────────
function eventInfo() {
  const ds = S.model.dates();
  return ds.length ? { range: rangeText(ds[0], ds[ds.length - 1]) } : { range: 'No requests yet' };
}
function nextBinDay() {
  const ds = S.model.dates(), t = todayISO();
  if (!ds.length) return [null, []];
  const nd = ds.find((d) => d >= t) || ds[ds.length - 1];
  return [nd, S.model.schedule.filter((r) => r.date === nd)];
}
function viewDashboard() {
  const m = S.model;
  const need = m.items.reduce((t, i) => t + m.required(i), 0), miss = m.items.reduce((t, i) => t + m.missing(i), 0);
  const pct = need ? Math.round((100 * (need - miss)) / need) : 100;
  const contrib = m.items.filter((i) => i.group !== 'Cooking Ingredients'), raw = m.items.filter((i) => i.group === 'Cooking Ingredients');
  const done = m.items.filter((i) => m.missing(i) === 0).length;
  const stats = [
    ['Contribution units left', contrib.reduce((t, i) => t + m.missing(i), 0), 'fish, dishes and artifacts', 'var(--orange-dk)'],
    ['Raw ingredients left', raw.reduce((t, i) => t + m.missing(i), 0), 'to grow, gather or buy', 'var(--green)'],
    ['Items complete', done, `of ${m.items.length} item types`, 'var(--blue)'],
    ['Items still missing', m.items.length - done, 'on your shopping list', 'var(--berry)'],
  ];
  const villages = GROUPS.map((g) => {
    const arr = m.items.filter((i) => i.group === g);
    const n = arr.reduce((t, i) => t + m.required(i), 0), ms = arr.reduce((t, i) => t + m.missing(i), 0);
    const p = n ? Math.round((100 * (n - ms)) / n) : 100;
    const [fg] = GROUP_COLORS[g];
    return `<div class="village" data-act="nav" data-v="${esc(g)}">${tileIcon(NAV_ICONS[g], 46, g)}
      <div><div class="vname">${esc(g)}</div><div class="bar" style="margin-top:6px"><i style="width:${p}%;background:${fg}"></i></div>
      <div class="small muted" style="margin-top:4px">${ms ? `${fmt(ms)} still needed \u00b7 ${arr.length} items` : 'All done!'}</div></div>
      <b style="color:${fg}">${p}%</b></div>`;
  }).join('');
  const [nd, entries] = nextBinDay();
  const reqs = entries.slice(0, 7).map((r) => {
    const k = key(r.group, r.name);
    let tag;
    if (m.binDone(r.date, r.bin)) tag = '<span class="tag">\u2713 Delivered</span>';
    else { const [c] = m.binCover(r.date, r.bin, k); tag = `<span class="tag ${c >= r.quantity ? 'green' : 'orange'}">${c >= r.quantity ? '\u2713 ' : ''}${c}/${r.quantity}</span>`; }
    return `<div class="req-row">${icon(r.name, 30, r.group)}<div class="grow"><b>${esc(r.name)}</b><div class="tiny muted">${esc(r.bin)}</div></div>${tag}</div>`;
  }).join('');
  const tasks = m.buildTasks();
  const t = tasks[0];
  return `<section class="hero"><div><div style="font-weight:700;opacity:.9">Upcoming bin requests</div>
      <div class="when">${esc(eventInfo().range)}</div><div style="font-weight:700">${esc(updatedText())}</div></div>
      <div class="pct"><b>${pct}%</b><div style="font-weight:700;opacity:.9">overall complete</div><div class="bar"><i style="width:${pct}%"></i></div></div></section>
    <div class="stats">${stats.map(([l, v, s, c]) => `<div class="card stat"${l === 'Items still missing' ? ' data-act="nav" data-v="Shopping List" style="cursor:pointer"' : ''}>
      <div class="small muted"><span class="dot" style="background:${c}"></span> ${esc(l)}</div><b style="color:${c}">${fmt(v)}</b><div class="small muted">${esc(s)}</div></div>`).join('')}</div>
    <div class="dash-grid"><div class="card"><h3 class="cardtitle">Progress by village</h3><div class="small muted">Open a village to see its list</div>${villages}</div>
      <div class="card"><h3 class="cardtitle">Next bin requests</h3><div class="small muted" style="margin-bottom:8px">${nd ? prettyDate(nd) : 'No schedule'}</div>
        ${reqs || '<div class="muted small">Nothing requested.</div>'}
        ${entries.length > 7 ? `<div class="small muted">+ ${entries.length - 7} more requests</div>` : ''}
        <button class="btn" style="margin-top:12px" data-act="open-bins" data-d="${nd || ''}">Open contribution bins</button></div></div>
    <div class="card" style="margin-top:16px"><div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
      <h3 class="cardtitle">Next task</h3>${t ? dueTag(t.deadline) : ''}<button class="btn" style="margin-left:auto" data-act="nav" data-v="Task List">Open task list</button></div>
      ${t ? `<div style="font-weight:700;margin:6px 0 10px">${esc(taskTitle(t))} \u2013 ${esc(taskSub(t))}</div>
        <div class="chips">${t.items.slice(0, 6).map((e) => `<span class="req-row" style="padding:0 14px 0 0">${icon(e.name, 28, e.group)}<span class="${e.bonus ? 'muted' : ''}">${esc(e.name)} \u00d7${e.short}</span></span>`).join('')}
        ${t.items.length > 6 ? `<span class="muted small">+${t.items.length - 6} more</span>` : ''}</div>
        ${tasks.length > 1 ? `<div class="tiny muted" style="margin-top:8px">Then ${plural(tasks.length - 1, 'more stop')}.</div>` : ''}`
      : '<div class="muted small" style="margin-top:6px">Nothing left to collect \u2013 every open bin has its fish and artifacts covered.</div>'}</div>`;
}

// ───────── My Items (your item database) ─────────
function viewMyItems() {
  const u = S.ui.db;
  const cats = ['All', ...CATEGORIES, 'Other'];
  return `<div class="toolbar">
      <label class="search"><span aria-hidden="true">\u2315</span><input id="db-search" type="search" placeholder="Search by name or category" value="${esc(u.search)}" aria-label="Search items" autocomplete="off">
        <button class="x" data-act="db-clear" aria-label="Clear search">\u2715</button></label>
      <div class="chips">${[['Items I have', true], ['All codex items', false]].map(([l, v]) => `<button class="chip ${u.owned === v ? 'on' : ''}" data-act="db-owned" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="chips" style="margin-left:auto"><span class="small muted">Sort</span>
        ${[['az', 'A\u2013Z'], ['most', 'Most'], ['fewest', 'Fewest']].map(([v, l]) => `<button class="chip ${u.sort === v ? 'on' : ''}" data-act="db-sort" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="chips" id="db-cats" style="margin-bottom:10px">${cats.map((c) => `<button class="chip ${u.cat === c ? 'on' : ''}" data-act="db-cat" data-v="${c}">${c}<span class="n"></span></button>`).join('')}</div>
    <p class="note" id="db-note"></p>
    <div class="split"><div id="db-grid" class="inv-grid"></div><div id="db-panel" class="card detail"></div></div>`;
}
function dbRows() {
  const m = S.model, u = S.ui.db;
  if (!S._dbCache || S._dbCache.model !== m) S._dbCache = { model: m, rows: m.database() };
  const base = S._dbCache.rows.filter((r) => !u.owned || m.get(r.key) > 0);
  const toks = normName(u.search).split(' ').filter(Boolean);
  let rows = base.filter((r) => (u.cat === 'All' || r.category === u.cat) && toks.every((t) => r.search.includes(t)));
  const by = { az: (a, b) => a.name.localeCompare(b.name), most: (a, b) => m.get(b.key) - m.get(a.key) || a.name.localeCompare(b.name), fewest: (a, b) => m.get(a.key) - m.get(b.key) || a.name.localeCompare(b.name) };
  rows = rows.sort(by[u.sort] || by.az);
  return { base, rows, toks };
}
function fillMyItems() {
  const m = S.model, u = S.ui.db;
  const { base, rows, toks } = dbRows();
  const counts = {};
  for (const r of base) counts[r.category] = (counts[r.category] || 0) + 1;
  $$('#db-cats .chip').forEach((b) => { $('.n', b).textContent = b.dataset.v === 'All' ? base.length : (counts[b.dataset.v] || 0); });
  const total = rows.reduce((t, r) => t + m.get(r.key), 0);
  $('#db-note').textContent = rows.length
    ? `Showing ${rows.length === base.length ? rows.length : `${rows.length} of ${base.length}`} ${u.owned ? 'items you have' : 'codex items'} \u00b7 ${fmt(total)} in total. Click an item to change its count; + and \u2212 on your keyboard adjust the selected item.`
    : (toks.length || u.cat !== 'All' ? 'No matches \u2013 try fewer letters, another category, or \u201cAll codex items\u201d.' : 'No items yet \u2013 import a CSV, or switch to \u201cAll codex items\u201d to add counts.');
  if (!rows.find((r) => r.key === u.sel)) u.sel = rows[0]?.key || null;
  $('#db-grid').innerHTML = rows.map((r) => invTile(r)).join('');
  renderDbPanel();
}
function invTile(r) {
  const n = S.model.get(r.key);
  const rar = S.model.itemInfo(r.name).rarity;
  const st = RARITY_STARS[rar];
  return `<button class="inv-cell ${n ? '' : 'zero'}" data-act="db-sel" data-key="${esc(r.key)}" title="${esc(r.name)}" aria-label="${esc(r.name)}, ${n}">
    <span class="inv ${S.ui.db.sel === r.key ? 'sel' : ''}">${st ? `<span class="rar" style="color:${st[1]}">${st[0]}</span>` : ''}${icon(r.name, 80, groupOfCat(r.category), '')}<span class="count">${fmt(n)}</span></span>
    <span class="cap">${esc(r.name)}</span></button>`;
}
function renderDbPanel() {
  const m = S.model, el = $('#db-panel');
  if (!el) return;
  const r = S._dbCache?.rows.find((x) => x.key === S.ui.db.sel);
  if (!r) { el.innerHTML = '<div class="empty">Pick an item to see and change its count.</div>'; return; }
  const item = m.byKey.get(r.key);
  const info = m.itemInfo(r.name);
  const where = [info.location, info.district].filter(Boolean).join(', ');
  let needLine = '';
  if (item && m.required(item)) {
    const ms = m.missing(item);
    needLine = `<div class="small" style="margin-top:8px;font-weight:700;color:${ms ? 'var(--orange-dk)' : 'var(--green)'}">Needed for bins and recipes: ${m.required(item)} \u00b7 ${ms ? `${ms} still missing` : 'covered \u2713'}</div>`;
  }
  el.innerHTML = `${tileIcon(r.name, 96, groupOfCat(r.category))}
    <h3 class="cardtitle" style="margin-top:12px;font-size:22px">${esc(r.name)}</h3>
    <div class="chips" style="margin-top:6px"><span class="tag ${CAT_TAG[r.category] || ''}">${esc(r.category)}</span>${rarityTag(info.rarity)}</div>
    ${where ? `<div class="small muted" style="margin-top:6px">Found at ${esc(where)}</div>` : ''}${needLine}
    <label class="small muted" style="display:block;margin:16px 0 4px" for="db-qty">Quantity</label>
    <input id="db-qty" class="qty-input" type="number" inputmode="numeric" min="0" value="${m.get(r.key)}">
    <div class="tiny muted" id="db-qty-msg" style="margin-top:4px">Type a number and press Enter to save</div>
    <div class="btns" style="display:flex;gap:6px;margin-top:12px;flex-wrap:wrap">
      ${[[-1, '\u2212 1'], [1, '+ 1'], [5, '+ 5'], [10, '+ 10']].map(([d, l]) => `<button class="btn ${d === 1 ? 'primary' : ''}" data-act="db-delta" data-d="${d}">${l}</button>`).join('')}</div>
    <button class="btn small" style="margin-top:8px" data-act="db-save">Save typed amount</button>
    <div style="margin-top:14px"><a class="linkish small" href="${itemUrl(r.name)}" target="_blank" rel="noopener">Open on loftiacodex.com \u2197</a></div>`;
}
async function dbSet(n) {
  const k = S.ui.db.sel;
  if (!k) return;
  n = Math.max(0, n);
  S.model.have.set(k, n); rebuild();
  const tile = $(`.inv-cell[data-key="${CSS.escape(k)}"]`);
  if (tile) { $('.count', tile).textContent = fmt(n); tile.classList.toggle('zero', !n); }
  renderDbPanel();
  $('.side')?.replaceWith(htmlEl(sidebar()));
  await safely(() => db.setInventory([{ item_key: k, have: n }]), 'Your change couldn\u2019t be saved.');
}
const htmlEl = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstChild; };

// ───────── item lists (Shopping List, villages, ingredients) ─────────
function viewList() {
  const m = S.model, cat = S.view;
  const methods = [...new Set(m.rows(cat).map((i) => i.method))].sort();
  if (methods.includes('Cook')) methods.splice(methods.indexOf('Cook') + 1, 0, 'Can cook');
  if (!['All', ...methods].includes(S.ui.method)) S.ui.method = 'All';
  const canCook = m.items.filter((i) => m.cookable(i) > 0).length;
  return `<div class="toolbar">
      <label class="search"><span aria-hidden="true">\u2315</span><input id="list-search" type="search" placeholder="Search items" value="${esc(S.ui.search)}" aria-label="Search items" autocomplete="off">
        <button class="x" data-act="list-clear" aria-label="Clear search">\u2715</button></label>
      <div class="chips">${['All', ...methods].map((x) => `<button class="chip ${S.ui.method === x ? 'on' : ''}" data-act="method" data-v="${x}">${x}${x === 'Can cook' ? `<span class="n">${canCook}</span>` : ''}</button>`).join('')}</div>
      ${cat !== 'Shopping List' ? `<button class="chip ${S.ui.missingOnly ? 'on' : ''}" style="margin-left:auto" data-act="missing">Missing only</button>` : ''}</div>
    <p class="note" id="list-note"></p><div class="split"><div class="card table-card" id="list-table"></div><div class="card detail" id="list-detail"></div></div>`;
}
function listRows() {
  const m = S.model, cat = S.view, toks = normName(S.ui.search).split(' ').filter(Boolean);
  let rows = m.rows(cat).filter((i) => toks.every((t) => normName(`${i.name} ${i.group}`).includes(t))
    && (S.ui.method === 'All' || i.method === S.ui.method || (S.ui.method === 'Can cook' && m.cookable(i) > 0))
    && (!S.ui.missingOnly || cat === 'Shopping List' || m.missing(i) > 0));
  const [col, dir] = S.ui.sort;
  const val = { name: (i) => i.name.toLowerCase(), group: (i) => i.group, method: (i) => i.method, station: (i) => m.station(i) || 9, need: (i) => m.required(i), have: (i) => m.haveOf(i), missing: (i) => m.missing(i), status: (i) => m.missing(i) };
  if (S.ui.method === 'Can cook' && col === 'name') rows.sort((a, b) => (m.station(a) || 9) - (m.station(b) || 9) || a.name.localeCompare(b.name));
  else rows.sort((a, b) => { const x = val[col](a), y = val[col](b); return (x < y ? -1 : x > y ? 1 : a.name.localeCompare(b.name)) * dir; });
  return rows;
}
function fillList() {
  const m = S.model, cat = S.view, rows = listRows();
  const showGroup = cat === 'Shopping List' || cat === 'All Items';
  const showStation = cat === 'Global Village' || S.ui.method === 'Can cook' || (showGroup && S.ui.method === 'Cook');
  const cols = [['name', 'Item'], ...(showGroup ? [['group', 'Village']] : []), ['method', 'Source'], ...(showStation ? [['station', 'Station']] : []),
    ['need', 'Need', 'num'], ['have', 'Have', 'num'], ['missing', 'Missing', 'num'], ['status', 'Status']];
  const sel = S.ui.sel[cat];
  if (!rows.find((i) => key(i.group, i.name) === sel)) S.ui.sel[cat] = rows[0] ? key(rows[0].group, rows[0].name) : null;
  const left = rows.reduce((t, i) => t + m.missing(i), 0);
  $('#list-note').textContent = S.ui.method === 'Can cook' && !rows.length
    ? 'Nothing to cook yet \u2013 you\u2019re missing at least one raw ingredient for every dish.'
    : `${plural(rows.length, 'item')} \u00b7 ${fmt(left)} still needed \u00b7 Click a row for details; + and \u2212 on your keyboard adjust the selected item.`;
  const arrow = (c) => (S.ui.sort[0] === c ? (S.ui.sort[1] > 0 ? ' \u25B4' : ' \u25BE') : '');
  $('#list-table').innerHTML = rows.length ? `<table class="items"><thead><tr>${cols.map(([c, l, cls]) => `<th class="${cls || ''}" data-act="sort" data-c="${c}">${l}${arrow(c)}</th>`).join('')}</tr></thead><tbody>
    ${rows.map((i) => {
      const k = key(i.group, i.name), n = m.missing(i), ck = m.cookable(i);
      const status = (n === 0 ? '\u2713 Complete' : `Need ${n}`) + (ck ? ` \u00b7 can cook ${ck}` : '');
      return `<tr class="row ${S.ui.sel[cat] === k ? 'sel' : ''} ${n === 0 ? 'done' : ''}" data-act="sel-item" data-key="${esc(k)}">
        <td><div class="name-cell">${icon(i.name, 28, i.group)}<span>${esc(i.name)}</span></div></td>
        ${showGroup ? `<td>${esc(i.group)}</td>` : ''}<td>${esc(i.method)}</td>${showStation ? `<td>${m.station(i) ? `Lv ${m.station(i)}` : ''}</td>` : ''}
        <td class="num">${m.required(i)}</td><td class="num">${m.haveOf(i)}</td><td class="num">${n}</td><td>${status}</td></tr>`;
    }).join('')}</tbody></table>` : '<div class="empty">No items match.</div>';
  renderItemDetail();
}
function renderItemDetail() {
  const m = S.model, el = $('#list-detail');
  if (!el) return;
  const i = m.byKey.get(S.ui.sel[S.view]);
  if (!i) { el.innerHTML = '<div class="empty">Pick an item from the list to see its details.</div>'; return; }
  const have = m.haveOf(i), req = m.required(i), miss = m.missing(i);
  const [fg, soft] = GROUP_COLORS[i.group];
  const info = m.itemInfo(i.name);
  const where = [info.location, info.district].filter(Boolean).join(', ');
  const pct = req ? Math.round((100 * Math.min(have, req)) / req) : 100;
  const status = !req ? ['Not needed right now', 'var(--muted)'] : !miss ? ['All set! \u2713', 'var(--green)'] : [`${miss} more to go`, 'var(--orange-dk)'];
  const can = m.cookable(i);
  let cook = '';
  if (i.group === 'Global Village' && m.recipeMap.has(i.name)) {
    cook = can ? `<div style="display:flex;align-items:center;gap:6px;margin-top:10px"><b class="small" style="color:var(--green)">You can cook ${can} right now</b>
      <button class="btn small primary" style="margin-left:auto" data-act="cook1">Cook 1</button><button class="btn small" data-act="cookn">Cook\u2026</button></div>`
      : '<div class="small muted" style="margin-top:10px">Missing raw ingredients to cook this</div>';
  }
  let relTitle = '', rel = [];
  if (i.group === 'Global Village' && m.recipeMap.has(i.name)) {
    relTitle = 'Recipe, per dish';
    rel = m.recipeMap.get(i.name).map((r) => [r.ingredient, 'Cooking Ingredients', `\u00d7${r.per} \u00b7 have ${m.get(key('Cooking Ingredients', r.ingredient))}`]);
  } else if (i.group === 'Cooking Ingredients') {
    relTitle = 'Used in';
    rel = m.usesOf(i.name).map((r) => { const d = m.item('Global Village', r.dish); const l = d ? m.missing(d) : 0; return [r.dish, 'Global Village', `\u00d7${r.per} \u00b7 ${l ? `${l} to cook` : 'done'}`]; });
  } else {
    const reqs = m.requestsFor(i);
    if (reqs.length) { relTitle = 'Bin requests'; rel = reqs.map((r) => [null, `${shortDate(r.date)} \u00b7 ${r.bin}`, `\u00d7${r.quantity}${m.binDone(r.date, r.bin) ? ' \u2713' : ''}`]); }
  }
  el.innerHTML = `${tileIcon(i.name, 96, i.group)}<h3 class="cardtitle" style="margin-top:12px;font-size:22px">${esc(i.name)}</h3>
    <div class="chips" style="margin-top:6px"><span class="tag" style="background:${soft};color:${fg}">${esc(i.group)}</span><span class="tag">${esc(i.method)}</span>
      ${m.station(i) ? `<span class="tag blue">Station Lv ${m.station(i)}</span>` : ''}${rarityTag(info.rarity)}</div>
    ${where ? `<div class="small muted" style="margin-top:6px">Found at ${esc(where)}</div>` : TASK_GROUPS.includes(i.group) ? '<div class="small muted" style="margin-top:6px">Location not looked up yet \u2013 press Update requests</div>' : ''}
    <div class="big"><b>${have}</b><span>/ ${req}</span></div><div class="tiny muted">in your bag / needed</div>
    <div class="bar" style="margin:10px 0 6px;background:${soft}"><i style="width:${pct}%;background:${miss ? fg : 'var(--green)'}"></i></div>
    <b class="small" style="color:${status[1]}">${status[0]}</b>${cook}
    <div class="btns"><button class="btn" data-act="item-delta" data-d="-1">\u2212 1</button><button class="btn primary" data-act="item-delta" data-d="1">+ 1</button>
      <button class="btn" data-act="item-delta" data-d="5">+ 5</button><button class="btn small" data-act="item-set">Set amount\u2026</button><button class="btn small" data-act="item-add">Add acquired\u2026</button></div>
    ${relTitle ? `<div class="rel"><div class="small muted" style="font-weight:700;margin-bottom:6px">${relTitle}</div>
      ${rel.slice(0, 6).map(([n, g, right]) => `<div class="r">${n ? `${icon(n, 22, g)}<span>${esc(n)}</span>` : `<span>${esc(g)}</span>`}<span class="right">${esc(right)}</span></div>`).join('')}
      ${rel.length > 6 ? `<div class="tiny muted">+ ${rel.length - 6} more</div>` : ''}</div>` : ''}
    <div style="margin-top:14px"><a class="linkish small" href="${itemUrl(i.name)}" target="_blank" rel="noopener">Open on loftiacodex.com \u2197</a></div>`;
}

// ───────── Contribution bins ─────────
function viewBins() {
  const m = S.model, dates = m.dates(), today = todayISO();
  if (!dates.length) return '<div class="card empty">No bin requests loaded \u2013 press Update requests.</div>';
  if (!dates.includes(S.ui.binDay)) S.ui.binDay = dates.find((d) => d >= today) || dates[dates.length - 1];
  const day = S.ui.binDay;
  const chips = dates.map((d) => {
    const bins = [...new Set(m.schedule.filter((r) => r.date === d).map((r) => r.bin))];
    const done = bins.filter((b) => m.binDone(d, b)).length;
    return `<button class="chip ${d === day ? 'on' : ''}" data-act="bin-day" data-d="${d}">${shortDate(d)}${d === today ? ' (today)' : ''}<span class="n">${done < bins.length ? `${done}/${bins.length}` : '\u2713'}</span></button>`;
  }).join('');
  const open = m.openBins(day), expired = m.isExpired(day);
  const ready = open.filter((b) => m.binReady(day, b));
  const note = expired ? 'This day has passed \u2013 requests that weren\u2019t marked done have expired.'
    : open.length ? `${plural(open.length, 'bin')} left, ${ready.length} ready to hand in. A bin can only be marked done when every item is in your bag.` : 'Every bin is done for this day \u2713';
  const sections = EFFORTS.map(([group, effort]) => {
    const labels = Object.keys(BIN_INFO).filter((b) => b.startsWith(group));
    const withReq = labels.filter((b) => m.binEntries(day, b).length);
    return `<div class="effort">${tileIcon(NAV_ICONS[group], 36, group)}<h2>${esc(effort)}</h2><span class="muted small">${withReq.filter((b) => m.binDone(day, b)).length}/${withReq.length} done</span></div>
      <div class="bins-row">${labels.map((b) => binCard(day, b)).join('')}</div>`;
  }).join('');
  return `<div class="chips" style="margin-bottom:12px">${chips}</div>
    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:6px"><h2 class="section" style="margin:0">${prettyDate(day)}</h2>
      <span class="muted small">${esc(note)}</span>
      ${ready.length && !expired ? `<button class="btn primary small" style="margin-left:auto" data-act="mark-day" data-d="${day}">\u2713 Mark all ready bins done</button>` : ''}</div>${sections}`;
}
function binCard(day, bin) {
  const m = S.model;
  const group = bin.split(' Lv')[0];
  const [fg, soft] = GROUP_COLORS[group];
  const [lv, loc] = BIN_INFO[bin] || ['', bin];
  const entries = m.binEntries(day, bin), done = m.binDone(day, bin), expired = m.isExpired(day) && !done;
  const short = m.binShort(day, bin), ready = m.binReady(day, bin);
  const removed = done ? m.removedFor(day, bin) : {};
  const chip = done ? '<span class="tag green">\u2713 Done</span>' : expired ? '<span class="tag">Expired</span>' : !entries.length ? ''
    : ready ? '<span class="tag green">Ready</span>' : `<span class="tag orange">Need ${short} more</span>`;
  const ents = entries.length ? entries.map((e) => {
    let sub, color;
    if (done) { sub = `${removed[e.key] || 0} taken from bag`; color = '#8FB89A'; }
    else if (expired) { sub = 'Expired'; color = 'var(--muted)'; }
    else {
      const [c, q] = m.binCover(day, bin, e.key), have = m.get(e.key);
      if (c >= q) { sub = `\u2713 ${c}/${q} ready`; color = 'var(--green)'; }
      else if (have > c && have >= q) { sub = `${c}/${q} \u00b7 ${have} in bag, some saved for earlier bins`; color = 'var(--orange-dk)'; }
      else { sub = `${c}/${q} \u00b7 find ${q - c} more`; color = 'var(--orange-dk)'; }
    }
    return `<div class="ent">${icon(e.name, 34, e.group)}<div class="grow"><b class="${done || expired ? 'muted' : ''}">${esc(e.name)}</b>
      <div class="tiny" style="color:${color}">${esc(sub)}</div></div><span class="q ${done ? 'muted' : ''}">\u00d7${e.qty}</span></div>`;
  }).join('') : '<div class="small muted">No requests this day</div>';
  let foot = '';
  if (done) foot = '<span class="tiny" style="color:#8FB89A">Items removed from your bag</span><button class="btn small" style="margin-left:auto" data-act="undo-bin" data-d="' + day + '" data-b="' + esc(bin) + '">Undo</button>';
  else if (entries.length && !expired && ready) foot = `<button class="btn primary small" data-act="mark-bin" data-d="${day}" data-b="${esc(bin)}">\u2713 Mark bin done</button>`;
  else if (entries.length && !expired) foot = `<span class="tiny muted">Collect ${plural(short, 'more item')} to finish this bin</span>`;
  return `<div class="card bin ${done ? 'done' : ''}"><div class="head"><span class="tag" style="background:${soft};color:${fg}">${esc(lv)}</span><b>${esc(loc)}</b>${chip}</div>
    ${ents}<div class="foot">${foot}</div></div>`;
}

// ───────── Task list ─────────
function dueText(day) { const n = daysBetween(todayISO(), day); return n <= 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due ${shortDate(day)}`; }
function dueTag(day) { const n = daysBetween(todayISO(), day); return `<span class="tag ${n <= 0 ? 'berry' : n === 1 ? 'orange' : 'blue'}">${dueText(day)}</span>`; }
const taskTitle = (t) => (t.district ? `Go to ${t.district}` : t.location ? `Go to ${t.location}` : 'Location not listed');
const taskSub = (t) => (t.location && t.district ? `find these at ${t.location}` : t.district ? 'the exact spot isn\u2019t listed on the codex' : 'press Update requests to look these up, or open each codex page');
function viewTasks() {
  const m = S.model, f = S.ui.taskFilter;
  const groups = f === 'All' ? TASK_GROUPS : [f];
  const tasks = m.buildTasks(groups);
  const nItems = tasks.reduce((t, x) => t + x.items.length, 0);
  const missing = m.missingInfo().filter((i) => groups.includes(i.group));
  let last = null, n = 0;
  const body = tasks.map((t) => {
    n++;
    const head = t.deadline !== last ? `<h2 class="section">${prettyDate(t.deadline)} \u2013 ${dueText(t.deadline)}</h2>` : '';
    last = t.deadline;
    const main = t.items.filter((e) => !e.bonus).length, bonus = t.items.length - main;
    const counts = {};
    for (const e of t.items) counts[e.rarity || 'Unknown'] = (counts[e.rarity || 'Unknown'] || 0) + 1;
    const mix = Object.entries(counts).sort((a, b) => (RARITIES.indexOf(a[0]) + 99) % 99 - (RARITIES.indexOf(b[0]) + 99) % 99).map(([k, v]) => `${v} ${k}`).join(', ');
    return `${head}<div class="card task"><div class="th"><div class="num ${t.known ? '' : 'unknown'}">${n}</div><div class="titles">
        <h3 class="cardtitle">${esc(taskTitle(t))}</h3><div class="small muted">${esc(taskSub(t).replace(/^./, (c) => c.toUpperCase()))}. ${main} due${bonus ? `, plus ${bonus} extra while you\u2019re here` : ''}.</div>
        <div class="tiny muted">${esc(mix)}</div></div>${dueTag(t.deadline)}</div>
      <div style="margin-top:10px">${t.items.map((e) => taskItem(e, t)).join('')}</div></div>`;
  }).join('');
  const finds = S.finds.slice(0, 12);
  return `<div class="toolbar"><div class="chips">${['All', ...TASK_GROUPS].map((x) => `<button class="chip ${f === x ? 'on' : ''}" data-act="task-filter" data-v="${x}">${x}</button>`).join('')}</div>
      <span class="small muted" style="margin-left:auto">${plural(tasks.length, 'stop')}, ${plural(nItems, 'item')} to find</span></div>
    ${missing.length ? `<div class="banner"><span class="small">Rarity and location haven\u2019t been looked up yet for ${plural(missing.length, 'item')}, so they\u2019re listed under \u201cLocation not listed\u201d for now.</span>
      ${S.updating ? '' : '<button class="btn primary small" style="margin-left:auto" data-act="update">Look up now</button>'}</div>` : ''}
    ${tasks.length ? body : '<div class="card"><h3 class="cardtitle" style="color:var(--green)">Nothing left to collect \u2713</h3><div class="small muted">Every open bin already has its fish and artifacts covered by what\u2019s in your bag.</div></div>'}
    ${finds.length ? `<h2 class="section">Collected today</h2><div class="card">${finds.map((x) => {
      const [g, name] = splitKey(x.item_key);
      return `<div class="req-row"><span class="tiny muted" style="width:70px">${new Date(x.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>${icon(name, 24, g)}
        <span class="grow"><b>+${x.qty}</b> ${esc(name)}</span><button class="btn small" data-act="undo-find" data-id="${x.id}">Undo</button></div>`;
    }).join('')}</div>` : ''}`;
}
function taskItem(e, t) {
  const first = e.bins.filter(([d]) => d === e.due).reduce((s, [, , q]) => s + q, 0), later = e.short - first;
  const n = daysBetween(todayISO(), e.due);
  const when = n <= 0 ? 'for today\u2019s bin' : n === 1 ? 'for tomorrow\u2019s bin' : `for ${shortDate(e.due)}`;
  const have = e.item ? S.model.haveOf(e.item) : 0;
  return `<div class="ti">${icon(e.name, 34, e.group)}<div class="grow"><div class="chips"><b>${esc(e.name)}</b>${rarityTag(e.rarity)}
      ${e.bonus ? `<span class="tag blue">While you\u2019re here \u2013 needed ${shortDate(e.due)}</span>` : ''}</div>
      <div class="tiny muted">Find ${first} ${when}${later ? `, ${later} more for later bins` : ''}${have ? `. ${have} already in bag` : ''}</div></div>
    ${!t.known ? `<a class="linkish tiny" href="${itemUrl(e.name)}" target="_blank" rel="noopener">Codex \u2197</a>` : ''}
    ${e.item ? `<button class="btn primary small" data-act="found" data-key="${esc(e.key)}" data-short="${e.short}">\u2713 Found\u2026</button>` : ''}</div>`;
}

// ───────── Daily schedule ─────────
function viewSchedule() {
  const m = S.model, dates = m.dates(), today = todayISO();
  if (!['All', ...dates].includes(S.ui.schedDay)) S.ui.schedDay = 'All';
  const show = S.ui.schedDay === 'All' ? dates : [S.ui.schedDay];
  return `<div class="chips" style="margin-bottom:8px">${['All', ...dates].map((d) => `<button class="chip ${S.ui.schedDay === d ? 'on' : ''}" data-act="sched-day" data-d="${d}">${d === 'All' ? 'All days' : shortDate(d) + (d === today ? ' (today)' : '')}</button>`).join('')}</div>
    <p class="note">Your bag is shared out day by day, earliest bins first \u2013 an item only counts as Ready for one bin.</p>
    ${show.map((d) => {
      const rows = m.schedule.filter((r) => r.date === d);
      const delivered = rows.filter((r) => m.binDone(d, r.bin)).length;
      return `<h2 class="section">${prettyDate(d)} <span class="muted small">\u2013 ${delivered}/${rows.length} delivered</span></h2>
      <div class="card table-card" style="max-height:none"><table class="items"><thead><tr><th>Item</th><th>Bin</th><th class="num">Daily need</th><th class="num">Have (total)</th><th>Status</th></tr></thead><tbody>
      ${rows.map((r) => {
        const k = key(r.group, r.name), dv = m.binDone(d, r.bin), [c, q] = m.binCover(d, r.bin, k);
        const st = dv ? '\u2713 Delivered' : m.isExpired(d) ? 'Expired' : q && c >= q ? '\u2713 Ready' : `Short ${q - c}`;
        return `<tr class="${dv || st === 'Expired' || st === '\u2713 Ready' ? 'done' : ''}"><td><div class="name-cell">${icon(r.name, 28, r.group)}${esc(r.name)}</div></td>
          <td>${esc(r.bin)}</td><td class="num">${r.quantity}</td><td class="num">${m.get(k)}</td><td>${st}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    }).join('')}`;
}

// ───────── Recipes ─────────
function viewRecipes() {
  const m = S.model;
  const dishes = [...m.recipeMap.keys()].sort().filter((d) => { const it = m.item('Global Village', d); return it && !(S.ui.hideDone && m.missing(it) === 0); });
  return `<div class="toolbar"><span class="small muted">Ingredient targets update automatically as you cook dishes. Click a dish to see its ingredients.</span>
      <button class="chip ${S.ui.hideDone ? 'on' : ''}" style="margin-left:auto" data-act="hide-done">Hide finished dishes</button>
      <button class="btn primary small" data-act="nav" data-v="Cooking Ingredients">Cooking ingredients</button></div>
    <div class="card">${dishes.map((d) => {
      const it = m.item('Global Village', d), ms = m.missing(it), can = m.cookable(it);
      return `<details class="dish" ${ms ? 'open' : ''}><summary>${icon(d, 34, 'Global Village')}<span class="grow">${esc(d)}</span>
          ${m.station(it) ? `<span class="tag blue">Station Lv ${m.station(it)}</span>` : ''}${can ? `<span class="tag green">Can cook ${can}</span>` : ''}
          <span class="tag ${ms ? 'orange' : 'green'}">${ms ? `${ms} to cook` : '\u2713 Done'}</span><span class="small muted">have ${m.haveOf(it)}</span></summary>
        <div class="ings">${m.recipeMap.get(d).map((r) => {
          const h = m.get(key('Cooking Ingredients', r.ingredient));
          return `<div class="req-row">${icon(r.ingredient, 26, 'Cooking Ingredients')}<span class="grow">${esc(r.ingredient)} \u00d7${r.per}</span>
            <span class="tiny ${h >= r.per ? '' : 'muted'}" style="${h >= r.per ? 'color:var(--green)' : ''}">have ${h}${ms ? ` \u00b7 need ${ms * r.per}` : ''}</span></div>`;
        }).join('')}</div></details>`;
    }).join('') || '<div class="empty">No dishes requested right now.</div>'}</div>`;
}

// ───────── actions ─────────
const ACT = {
  nav: (d) => { S.view = d.v; S.menu = false; S.ui.search = ''; persist(); render(); scrollTo(0, 0); },
  menu: () => { S.menu = !S.menu; $('.app').classList.toggle('menu-open', S.menu); },
  signout: async () => { await db.signOut(); },
  'open-bins': (d) => { if (d.d) S.ui.binDay = d.d; ACT.nav({ v: 'Contribution Bins' }); },
  // lists
  method: (d) => { S.ui.method = d.v; persist(); renderView(); },
  missing: () => { S.ui.missingOnly = !S.ui.missingOnly; persist(); renderView(); },
  sort: (d) => { S.ui.sort = [d.c, S.ui.sort[0] === d.c ? -S.ui.sort[1] : (['need', 'have', 'missing', 'status'].includes(d.c) ? -1 : 1)]; persist(); fillList(); },
  'list-clear': () => { S.ui.search = ''; $('#list-search').value = ''; fillList(); $('#list-search').focus(); },
  'sel-item': (d) => { S.ui.sel[S.view] = d.key; $$('#list-table tr.row').forEach((r) => r.classList.toggle('sel', r.dataset.key === d.key)); renderItemDetail(); },
  'item-delta': (d) => { const i = selItem(); if (i) setCounts([{ item_key: key(i.group, i.name), have: S.model.haveOf(i) + Number(d.d) }]); },
  'item-set': async () => {
    const i = selItem(); if (!i) return;
    const n = await askAmount({ title: 'Set amount', prompt: `How many ${i.name} do you have right now?`, initial: S.model.haveOf(i), item: i });
    if (n != null) setCounts([{ item_key: key(i.group, i.name), have: n }]);
  },
  'item-add': async () => {
    const i = selItem(); if (!i) return;
    const n = await askAmount({ title: 'Items acquired', prompt: `How many new ${i.name} did you get?`, initial: 1, min: 1, item: i });
    if (n != null) setCounts([{ item_key: key(i.group, i.name), have: S.model.haveOf(i) + n }], `+${n} ${i.name}`);
  },
  cook1: () => cook(1),
  cookn: async () => {
    const i = selItem(), can = S.model.cookable(i);
    const n = await askAmount({ title: 'Cook', prompt: `How many ${i.name} did you cook? You have ingredients for ${can}.`, initial: Math.min(can, Math.max(1, S.model.missing(i))), min: 1, max: can, item: i });
    if (n) cook(n);
  },
  // My Items
  'db-owned': (d) => { S.ui.db.owned = d.v === 'true'; persist(); $$('[data-act="db-owned"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); fillMyItems(); },
  'db-sort': (d) => { S.ui.db.sort = d.v; persist(); $$('[data-act="db-sort"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); fillMyItems(); },
  'db-cat': (d) => { S.ui.db.cat = d.v; persist(); $$('[data-act="db-cat"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); fillMyItems(); },
  'db-clear': () => { S.ui.db.search = ''; $('#db-search').value = ''; fillMyItems(); $('#db-search').focus(); },
  'db-sel': (d) => { S.ui.db.sel = d.key; $$('.inv.sel').forEach((t) => t.classList.remove('sel')); $(`.inv-cell[data-key="${CSS.escape(d.key)}"] .inv`)?.classList.add('sel'); renderDbPanel(); },
  'db-delta': (d) => dbSet(S.model.get(S.ui.db.sel) + Number(d.d)),
  'db-save': () => saveTypedQty(),
  // bins
  'bin-day': (d) => { S.ui.binDay = d.d; persist(); renderView(); },
  'mark-bin': (d) => markBin(d.d, d.b),
  'undo-bin': (d) => undoBin(d.d, d.b),
  'mark-day': (d) => markDay(d.d),
  // tasks, schedule, recipes
  'task-filter': (d) => { S.ui.taskFilter = d.v; persist(); renderView(); },
  found: (d) => foundItem(d.key, Number(d.short)),
  'undo-find': (d) => undoFind(Number(d.id)),
  'sched-day': (d) => { S.ui.schedDay = d.d; persist(); renderView(); },
  'hide-done': () => { S.ui.hideDone = !S.ui.hideDone; persist(); renderView(); },
  // top bar
  update: () => runUpdate(),
  import: () => { const f = $('#csv-file'); f.value = ''; f.click(); },
  export: () => exportCSV(),
  backups: () => backupsDialog(),
  send: () => sendLink(),
};
const selItem = () => S.model.byKey.get(S.ui.sel[S.view]);
function saveTypedQty() {
  const inp = $('#db-qty'), n = Number(inp?.value.replace(/,/g, ''));
  if (!Number.isInteger(n) || n < 0) { const msg = $('#db-qty-msg'); msg.textContent = 'Enter a whole number (0 or more)'; msg.style.color = 'var(--berry)'; return; }
  const r = S._dbCache.rows.find((x) => x.key === S.ui.db.sel);
  dbSet(n);
  toast(`${r ? r.name : 'Item'}: ${fmt(n)}`);
}
function cook(n) {
  const i = selItem(), plan = S.model.cookPlan(i, n);
  if (plan) setCounts(plan, `Cooked ${n} ${i.name} \u2013 ingredients taken out of your bag`);
}
async function markBin(day, bin) {
  const m = S.model; m.recalc(todayISO());
  const plan = m.completePlan(day, bin);
  if (!plan) { await infoBox('Bin not complete', 'Every item for this bin needs to be in your bag before it can be marked done.'); return; }
  applyComplete(day, bin, plan);
  renderKeepScroll();
  toast(`${(BIN_INFO[bin] || ['', bin])[1]} done \u2013 ${plural(plan.reduce((t, p) => t + p.removed, 0), 'item')} taken out of your bag`);
  await safely(() => db.completeBin(day, bin, plan), 'The bin couldn\u2019t be marked done.');
}
function applyComplete(day, bin, plan) {
  const m = S.model;
  for (const p of plan) { m.have.set(p.item_key, Math.max(0, p.have)); m.completions.push({ day, bin, item_key: p.item_key, removed: p.removed, requested: p.requested }); }
  m.done.add(`${day}|${bin}`);
  m.recalc(todayISO());
}
async function undoBin(day, bin) {
  const m = S.model;
  for (const c of m.completions.filter((c) => c.day === day && c.bin === bin)) m.have.set(c.item_key, m.get(c.item_key) + c.removed);
  m.completions = m.completions.filter((c) => !(c.day === day && c.bin === bin));
  m.done.delete(`${day}|${bin}`);
  m.recalc(todayISO()); renderKeepScroll();
  toast('Undone \u2013 items put back in your bag', '\u21b6');
  await safely(() => db.undoBin(day, bin), 'The bin couldn\u2019t be un-marked.');
}
async function markDay(day) {
  const m = S.model; m.recalc(todayISO());
  const open = m.openBins(day), ready = open.filter((b) => m.binReady(day, b)), skipped = open.filter((b) => !ready.includes(b));
  if (!ready.length) return;
  const items = ready.reduce((t, b) => t + m.binEntries(day, b).reduce((s, e) => s + e.qty, 0), 0);
  let text = `Mark ${plural(ready.length, 'ready bin')} for ${prettyDate(day)} done?\n\n${ready.map((b) => (BIN_INFO[b] || ['', b])[1]).join(', ')}\n\nThis takes ${plural(items, 'item')} out of your bag.`;
  if (skipped.length) text += `\n\nNot ready yet, so these stay open:\n${skipped.map((b) => `\u2022 ${(BIN_INFO[b] || ['', b])[1]} \u2013 need ${m.binShort(day, b)} more`).join('\n')}`;
  if (!(await confirmBox('Mark ready bins done', text, 'Mark done'))) return;
  const plans = [];
  for (const b of ready) { m.recalc(todayISO()); const p = m.completePlan(day, b); if (p) { applyComplete(day, b, p); plans.push([b, p]); } }
  renderKeepScroll();
  toast(`${plural(plans.length, 'bin')} done`);
  await safely(async () => { for (const [b, p] of plans) await db.completeBin(day, b, p); }, 'Some bins couldn\u2019t be marked done.');
}
async function foundItem(k, short) {
  const item = S.model.byKey.get(k);
  const n = await askAmount({ title: 'Found items', prompt: `How many ${item.name} did you find?`, initial: short, min: 1, item });
  if (!n) return;
  S.model.have.set(k, S.model.get(k) + n); rebuild();
  const entry = { id: null, ts: new Date().toISOString(), item_key: k, qty: n };
  S.finds.unshift(entry);
  renderKeepScroll();
  toast(`+${n} ${item.name} added to your bag${short - n > 0 ? ` \u2013 ${short - n} more to go` : ' \u2013 all found'}`);
  await safely(async () => { entry.id = await db.logFind(k, n); renderKeepScroll(); }, 'The find couldn\u2019t be saved.');
}
async function undoFind(id) {
  const f = S.finds.find((x) => x.id === id);
  if (!f) return;
  S.model.have.set(f.item_key, Math.max(0, S.model.get(f.item_key) - f.qty)); rebuild();
  S.finds = S.finds.filter((x) => x !== f);
  renderKeepScroll();
  toast('Find undone \u2013 taken back out of your bag', '\u21b6');
  await safely(() => db.undoFind(id), 'The find couldn\u2019t be undone.');
}

// ───────── Update requests ─────────
async function runUpdate() {
  if (S.updating) return;
  S.updating = true; render();
  toast('Checking loftiacodex.com\u2026', '\u21bb');
  try {
    const before = JSON.stringify(S.model.schedule.map((r) => [r.date, r.bin, r.name, r.quantity]).sort());
    const data = await db.runUpdate(todayISO(), Object.keys(RECIPE_BOOK));
    const old = S.model;
    S.model = new Model(data);
    S.model.have = old.have; S.model.completions = old.completions; S.model.done = old.done;
    S.model.recalc(todayISO());
    S._dbCache = null; S.updateError = null; S.updating = false;
    render();
    const after = JSON.stringify(S.model.schedule.map((r) => [r.date, r.bin, r.name, r.quantity]).sort());
    let msg = before === after ? 'Requests are already up to date' : `Requests updated \u2013 ${data.schedule.length} requests for ${eventInfo().range}`;
    if (data.info_unknown) msg += ` \u00b7 location not found for ${plural(data.info_unknown, 'item')}`;
    if (S.model.missingRecipes.length) msg += ` \u00b7 no recipe found for ${S.model.missingRecipes.slice(0, 3).join(', ')}`;
    toast(msg);
    if (data.failed_bins?.length) {
      await infoBox('Some bins could not be updated', `These bin pages on loftiacodex.com couldn\u2019t be read:\n\n${data.failed_bins.map((b) => `\u2022 ${b}`).join('\n')}\n\nThey still show their requests from your last update. Everything else was updated. Try Update requests again later.`);
    }
  } catch (e) {
    S.updating = false; S.updateError = new Date(); $('.toast')?.remove(); render();
    await infoBox('Update failed', `${e.message}\n\nNothing was changed \u2013 your saved requests, inventory and completed bins are exactly as they were.`);
  }
}

// ───────── CSV export / import ─────────
function exportCSV() {
  const m = S.model;
  const rows = m.database().filter((r) => m.get(r.key) > 0).map((r) => [r.name, r.category, m.get(r.key)]);
  const blob = new Blob([toCSV([['Item', 'Category', 'Quantity'], ...rows])], { type: 'text/csv;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `loftia_inventory_${todayISO()}.csv`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast(`Exported ${plural(rows.length, 'item')}`);
}
document.getElementById('csv-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  let rows;
  try { rows = readInventoryCSV(await file.text()); } catch (err) { await infoBox('Import failed', `${err.message}\n\nNothing was changed.`); return; }
  const { resolved, unclear } = S.model.resolveImport(rows);
  const final = await reviewImport(resolved, unclear, file.name);
  if (!final) return;
  if (!final.length) { toast('Nothing to import', '!'); return; }
  const mode = await chooseImportMode(final.length, file.name);
  if (!mode) return;
  try {
    await db.makeBackup(`Before importing ${file.name}`);
    const totals = S.model.importTotals(final);
    await db.setInventory([...totals].map(([item_key, have]) => ({ item_key, have })), mode === 'replace');
    await reloadAll(); S._dbCache = null; render();
    toast(`Imported ${plural(totals.size, 'item')} \u2013 ${mode === 'replace' ? 'inventory replaced' : 'only these items updated'}. A backup was saved first.`);
  } catch (err) {
    await infoBox('Import failed', `${err.message}\n\nNothing was changed.`);
  }
});
function chooseImportMode(n, filename) {
  return new Promise((res) => {
    const m = modal({
      title: `Import ${plural(n, 'item')} from ${filename}`,
      sub: 'How should these counts be used? A backup of your current counts is saved either way, so you can undo it from Backups.',
      body: `<div style="display:grid;gap:10px;margin:8px 0">
        <button class="card" style="text-align:left;border:2px solid var(--orange);cursor:pointer" data-x="update"><b>Update only these items</b><div class="small muted">Items in the file get their new count. Everything else stays as it is.</div></button>
        <button class="card" style="text-align:left;border:2px solid var(--line);cursor:pointer" data-x="replace"><b>Replace my whole inventory</b><div class="small muted">Items in the file get their new count. Anything not in the file becomes 0.</div></button></div>`,
      foot: '<button class="btn" data-x="">Cancel</button>',
    });
    m.onClose = (v) => res(v || null);
    m.el.addEventListener('click', (e) => { const b = e.target.closest('[data-x]'); if (b) m.close(b.dataset.x || null); });
    $('[data-x="update"]', m.el).focus();
  });
}

/** Review every CSV row. Unclear rows get picture choices plus a search for any codex item. */
function reviewImport(resolved, unclear, filename) {
  return new Promise((res) => {
    const autoQty = new Map(), fileQty = new Map();
    for (const [n, , q] of resolved) autoQty.set(n, (autoQty.get(n) || 0) + q);
    for (const [n, q] of autoQty) fileQty.set(n, q);
    for (const r of unclear) { const h = CATALOG_INDEX.get(normName(r.name)); const n = h ? h[0] : r.name; fileQty.set(n, (fileQty.get(n) || 0) + r.qty); }
    const cards = unclear.map((r) => ({ row: r, choice: r.candidates[0] || (r.exact ? '__skip__' : '__keep__'), custom: null, finder: false, q: '' }));
    const label = (c) => (c.choice === '__skip__' ? null : c.choice === '__keep__' ? c.row.name : c.choice);
    const conflict = (i) => {
      const name = label(cards[i]);
      if (!name) return null;
      const why = [];
      if (autoQty.get(name)) why.push(`already in the file (\u00d7${autoQty.get(name)})`);
      const others = cards.filter((c, j) => j !== i && label(c) === name);
      if (others.length) why.push(`also picked for ${others.map((c) => `\u201c${c.row.name}\u201d`).join(', ')}`);
      return why.length ? [name, why] : null;
    };
    const pick = (i, val, nm, extra = '') => {
      const c = cards[i];
      const on = c.choice === val;
      let inner;
      if (val === '__keep__') inner = `<span class="sym">\u270e</span>Keep \u201c${esc(c.row.name)}\u201d`;
      else if (val === '__skip__') inner = '<span class="sym">\u2715</span>Skip this row';
      else if (val === '__other__') inner = '<span class="sym">\uff0b</span>Other item\u2026';
      else inner = `${icon(nm, 56, groupOfCat(catOfName(nm)), '')}${esc(nm)}${fileQty.get(nm) && normName(nm) !== normName(c.row.name) ? `<span class="also">Also in file \u00d7${fileQty.get(nm)}</span>` : ''}`;
      return `<button class="pick ${on ? 'on' : ''}" data-i="${i}" data-pick="${esc(val)}" ${extra}>${inner}</button>`;
    };
    const cardHTML = (i) => {
      const c = cards[i], r = c.row;
      const opts = [...r.candidates, ...(r.exact ? [] : ['__keep__'])];
      const why = r.confirm && r.exact ? 'Marked as unsure in the file' : !r.exact ? 'Not an exact name on loftiacodex.com' : 'Please confirm';
      const cf = conflict(i);
      const results = c.finder ? finderResults(i) : '';
      return `<div class="card" style="margin-bottom:10px" id="rc-${i}"><b>\u201c${esc(r.name)}\u201d \u00d7 ${r.qty}</b><div class="tiny muted">Row ${r.row} \u2013 ${why}</div>
        <div class="pick-tiles">${opts.map((o) => pick(i, o, o)).join('')}${c.custom && !opts.includes(c.custom) ? pick(i, c.custom, c.custom) : ''}${pick(i, '__other__', '', 'data-other="1"')}${pick(i, '__skip__', '')}</div>
        ${c.finder ? `<div class="finder"><input data-find="${i}" placeholder="Type part of a name\u2026" value="${esc(c.q)}" aria-label="Search all items"><div class="results" id="fr-${i}">${results}</div></div>` : ''}
        ${cf ? `<div class="warn">\u26a0 ${esc(cf[0])} is ${esc(cf[1].join(' and '))}. If you keep this, the counts are added together.</div>` : ''}</div>`;
    };
    const finderResults = (i) => {
      const c = cards[i], toks = normName(c.q).split(' ').filter(Boolean);
      const hits = (toks.length ? ALL_CATALOG_NAMES.filter((n) => toks.every((t) => normName(n).includes(t))) : ALL_CATALOG_NAMES).slice(0, 40);
      let html = hits.map((n) => `<button data-res="${i}" data-name="${esc(n)}">${icon(n, 22, groupOfCat(catOfName(n)))}<span>${esc(n)}</span>${fileQty.get(n) ? `<span class="tiny" style="margin-left:auto;color:var(--berry)">in file \u00d7${fileQty.get(n)}</span>` : ''}</button>`).join('');
      if (c.q.trim() && !CATALOG_INDEX.has(normName(c.q))) html += `<button data-res="${i}" data-name="${esc(c.q.trim())}">Use \u201c${esc(c.q.trim())}\u201d as typed</button>`;
      return html || '<div class="tiny muted" style="padding:8px">No matches</div>';
    };
    const autoList = [...resolved].sort((a, b) => (CATEGORIES.indexOf(a[1]) + 99) % 99 - (CATEGORIES.indexOf(b[1]) + 99) % 99 || a[0].localeCompare(b[0]));
    const autoHTML = (q) => {
      const toks = normName(q).split(' ').filter(Boolean);
      const hits = autoList.filter(([n, c]) => toks.every((t) => normName(`${n} ${c}`).includes(t)));
      return hits.map(([n, c, qty]) => { const cat = c || catOfName(n); return `<div class="a">${icon(n, 28, groupOfCat(cat))}<div><b>${esc(n)}</b><div class="tiny muted">\u00d7${fmt(qty)} \u2013 ${esc(cat)}</div></div></div>`; }).join('') || '<div class="muted small">No matches</div>';
    };
    const total = resolved.length + unclear.length;
    const m = modal({
      title: `Review your import \u2013 ${filename}`, wide: true, dismiss: false,
      sub: unclear.length ? `${plural(total, 'item')} in the file. ${unclear.length} need a quick check \u2013 click the picture that matches your game. Pictures marked \u201cAlso in file\u201d are already another row, so you don\u2019t pick one twice.`
        : `${plural(total, 'item')} in the file, all matched to loftiacodex.com. Look them over, then continue.`,
      body: `${unclear.length ? `<h2 class="section" style="margin-top:4px">Needs checking (${unclear.length})</h2><div id="rc-all">${cards.map((_, i) => cardHTML(i)).join('')}</div>` : ''}
        <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:14px 0 8px"><h2 class="section" style="margin:0">Matched automatically (${resolved.length})</h2>
          <label class="search" style="margin-left:auto;min-width:220px"><span aria-hidden="true">\u2315</span><input id="auto-filter" placeholder="Filter" aria-label="Filter matched items"></label></div>
        <div class="card"><div class="auto-grid" id="auto-grid">${autoHTML('')}</div></div>`,
      foot: '<span class="left" id="rv-status"></span><button class="btn" data-x="cancel">Cancel import</button><button class="btn primary" data-x="go">Continue</button>',
    });
    const status = () => {
      const n = cards.filter((_, i) => conflict(i)).length;
      const el = $('#rv-status', m.el);
      el.textContent = n ? `${plural(n, 'choice')} match another item in the file` : cards.length ? 'All choices look good' : '';
      el.style.color = n ? 'var(--berry)' : 'var(--green)';
    };
    const redraw = (i) => { $(`#rc-${i}`, m.el).outerHTML = cardHTML(i); };
    const redrawAll = () => { cards.forEach((_, i) => redraw(i)); status(); };
    status();
    m.onClose = (v) => res(v || null);
    m.el.addEventListener('click', async (e) => {
      const p = e.target.closest('[data-pick]');
      if (p) {
        const i = Number(p.dataset.i), c = cards[i];
        if (p.dataset.other) { c.finder = !c.finder; redraw(i); if (c.finder) $(`[data-find="${i}"]`, m.el).focus(); return; }
        c.choice = p.dataset.pick; redrawAll(); return;
      }
      const r = e.target.closest('[data-res]');
      if (r) { const i = Number(r.dataset.res), c = cards[i]; c.custom = r.dataset.name; c.choice = r.dataset.name; c.finder = false; redrawAll(); return; }
      const x = e.target.closest('[data-x]');
      if (!x) return;
      if (x.dataset.x === 'cancel') { m.close(null); return; }
      const clashes = cards.map((c, i) => [c, conflict(i)]).filter(([, cf]) => cf);
      if (clashes.length) {
        const ok = await confirmBox('Some choices match other items', `These choices are the same item as another row, so their counts will be added together:\n\n${clashes.map(([c, cf]) => `\u2022 \u201c${c.row.name}\u201d \u2192 ${cf[0]} (${cf[1].join(' and ')})`).join('\n')}\n\nContinue anyway?`, 'Continue');
        if (!ok) return;
      }
      const final = [...resolved];
      for (const c of cards) { const n = label(c); if (n) final.push([n, (CATALOG_INDEX.get(normName(n)) || ['', c.row.category])[1], c.row.qty]); }
      m.close(final);
    });
    m.el.addEventListener('input', (e) => {
      if (e.target.id === 'auto-filter') { $('#auto-grid', m.el).innerHTML = autoHTML(e.target.value); return; }
      const f = e.target.dataset.find;
      if (f != null) { cards[Number(f)].q = e.target.value; $(`#fr-${f}`, m.el).innerHTML = finderResults(Number(f)); }
    });
    m.el.addEventListener('keydown', (e) => {
      const f = e.target.dataset?.find;
      if (f != null && e.key === 'Enter') { e.preventDefault(); $(`#fr-${f} button`, m.el)?.click(); }
      if (f != null && e.key === 'ArrowDown') { e.preventDefault(); $(`#fr-${f} button`, m.el)?.focus(); }
      if (e.key === 'Escape' && f != null) { e.stopPropagation(); cards[Number(f)].finder = false; redraw(Number(f)); }
    });
  });
}

// ───────── backups ─────────
async function backupsDialog() {
  let list = [];
  try { list = await db.listBackups(); } catch (e) { await infoBox('Couldn\u2019t load backups', e.message); return; }
  const m = modal({
    title: 'Backups', sub: 'A backup is saved automatically before every CSV import. Restoring replaces your counts and completed bins with the backup.',
    body: list.length ? list.map((b) => `<div class="req-row"><div class="grow"><b>${esc(b.label)}</b><div class="tiny muted">${new Date(b.created_at).toLocaleString()}</div></div>
      <button class="btn small" data-restore="${b.id}">Restore</button></div>`).join('') : '<div class="muted small">No backups yet.</div>',
    foot: `<span class="left"><button class="linkish small" data-x="file-in">Import backup file…</button> &nbsp;·&nbsp;
      <button class="linkish small" data-x="file-out">Download backup file</button></span>
      <button class="btn" data-x="close">Close</button><button class="btn primary" data-x="now">Back up now</button>`,
  });
  m.el.addEventListener('click', async (e) => {
    const x = e.target.closest('[data-x]'), r = e.target.closest('[data-restore]');
    if (x?.dataset.x === 'close') m.close();
    if (x?.dataset.x === 'file-out') downloadBackup();
    if (x?.dataset.x === 'file-in') { m.close(); const f = $('#backup-file'); f.value = ''; f.click(); }
    if (x?.dataset.x === 'now') {
      try { await db.makeBackup('Manual backup'); m.close(); toast('Backup saved'); } catch (err) { infoBox('Backup failed', err.message); }
    }
    if (r) {
      if (!(await confirmBox('Restore this backup?', 'Your current counts and completed bins will be replaced with the backup. A backup of how things are now is saved first.', 'Restore'))) return;
      try {
        await db.makeBackup('Before restoring a backup');
        await db.restoreBackup(Number(r.dataset.restore));
        await reloadAll(); S._dbCache = null; m.close(); render(); toast('Backup restored');
      } catch (err) { infoBox('Restore failed', err.message); }
    }
  });
}

function downloadBackup() {
  const blob = new Blob([makeBackupJSON(S.model)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `loftia_backup_${todayISO()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  toast('Backup file downloaded');
}
document.getElementById('backup-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  let b;
  try { b = readBackupJSON(await file.text()); } catch (err) { await infoBox('Couldn\u2019t import that file', `${err.message}\n\nNothing was changed.`); return; }
  const items = Object.values(b.inventory).filter((v) => v > 0).length;
  const bins = new Set(b.completions.map((c) => `${c.day}|${c.bin}`)).size;
  const when = b.savedAt ? new Date(b.savedAt).toLocaleString() : 'an unknown date';
  const ok = await confirmBox('Restore from this backup file?',
    `${file.name}\nSaved ${when}\n\n\u2022 ${plural(items, 'item')} with a count\n\u2022 ${plural(bins, 'completed bin')}\n\n`
    + 'Your current counts and completed bins will be replaced with the backup. A backup of how things are now is saved first, so you can undo this from Backups.', 'Restore');
  if (!ok) return;
  try {
    await db.makeBackup('Before importing a backup file');
    const id = await db.addBackup(`Imported file: ${file.name}`, { inventory: b.inventory, completions: b.completions });
    await db.restoreBackup(id);
    await reloadAll(); S._dbCache = null; render();
    toast(`Backup restored \u2013 ${plural(items, 'item')}, ${plural(bins, 'completed bin')}`);
  } catch (err) {
    await infoBox('Import failed', `${err.message}\n\nIf your counts look wrong, open Backups and restore \u201cBefore importing a backup file\u201d.`);
    await reloadAll(); render();
  }
});

// ───────── sign-in & setup screens ─────────
function signInScreen() {
  return `<div class="signin"><div class="card"><div class="logo" style="padding:0">Loftia</div>
    <h1 style="font:600 24px var(--display);margin:22px 0 4px">Sign in to your dashboard</h1>
    <p class="muted small" style="margin:0">Enter your email and we\u2019ll send you a sign-in link. No password needed.</p>
    <form id="signin-form"><input id="email" type="email" required placeholder="you@example.com" autocomplete="email" aria-label="Email">
    <button class="btn primary" style="width:100%" data-act="send">Email me a sign-in link</button></form>
    <p class="small muted" id="signin-msg" style="margin-bottom:0"></p></div></div>`;
}
async function sendLink() {
  const email = $('#email').value.trim(), msg = $('#signin-msg');
  if (!email) return;
  msg.textContent = 'Sending\u2026';
  try { await db.sendSignInLink(email); msg.textContent = `Check ${email} for a sign-in link, then open it on this device.`; msg.style.color = 'var(--green)'; }
  catch (e) { msg.textContent = `Couldn\u2019t send the link: ${e.message}`; msg.style.color = 'var(--berry)'; }
}
function setupScreen() {
  return `<div class="signin"><div class="card"><div class="logo" style="padding:0">Loftia</div>
    <h1 style="font:600 22px var(--display);margin:22px 0 6px">Almost there</h1>
    <p class="small">This site isn\u2019t connected to Supabase yet. Open <b>js/config.js</b> on GitHub and paste in your Supabase project URL and anon key \u2013 the README walks you through it.</p></div></div>`;
}

// ───────── global events ─────────
root.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el) return;
  if (el.dataset.act === 'send') e.preventDefault();
  ACT[el.dataset.act]?.(el.dataset, el, e);
});
root.addEventListener('submit', (e) => { if (e.target.id === 'signin-form') { e.preventDefault(); sendLink(); } });
const onListSearch = debounce(() => fillList(), 120);
const onDbSearch = debounce(() => fillMyItems(), 120);
root.addEventListener('input', (e) => {
  if (e.target.id === 'list-search') { S.ui.search = e.target.value; onListSearch(); }
  if (e.target.id === 'db-search') { S.ui.db.search = e.target.value; onDbSearch(); }
});
root.addEventListener('keydown', (e) => {
  if (e.target.id === 'db-qty' && e.key === 'Enter') { e.preventDefault(); saveTypedQty(); }
  if ((e.target.id === 'db-search' || e.target.id === 'list-search') && e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input', { bubbles: true })); }
});
document.addEventListener('keydown', (e) => {
  if (document.querySelector('.overlay')) return;
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    const s = $('#db-search') || $('#list-search');
    if (s) { e.preventDefault(); s.focus(); s.select(); }
    return;
  }
  if (typing) return;
  const delta = e.key === '+' || e.key === '=' ? 1 : e.key === '-' ? -1 : 0;
  if (!delta) return;
  if (S.view === 'My Items' && S.ui.db.sel) { e.preventDefault(); dbSet(S.model.get(S.ui.db.sel) + delta); }
  else if (LIST_VIEWS.includes(S.view) && selItem()) { e.preventDefault(); ACT['item-delta']({ d: delta }); }
});

// ───────── start ─────────
async function start() {
  if (!db.configured) { render(); return; }
  S.session = await db.session();
  db.onAuth(async (s) => {
    const was = !!S.session;
    S.session = s;
    if (s && !was) { S.model = null; render(); await loadOrFail(); }
    if (!s) { S.model = null; render(); }
  });
  render();
  if (S.session) await loadOrFail();
}
async function loadOrFail() {
  try { await reloadAll(); render(); } catch (e) {
    root.innerHTML = `<div class="signin"><div class="card"><h1 style="font:600 22px var(--display)">Couldn\u2019t load your data</h1>
      <p class="small">${esc(e.message)}</p><p class="small muted">If this is a new setup, check that you ran <b>supabase/schema.sql</b> in the Supabase SQL Editor.</p>
      <button class="btn primary" onclick="location.reload()">Try again</button></div></div>`;
  }
}
start();
