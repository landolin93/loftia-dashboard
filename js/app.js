// Loftia Dashboard - website. Screens, pop-ups and actions.
import * as db from './db.js';
import {
  Model, GROUPS, TASK_GROUPS, RARITIES, CATEGORY_GROUP, ADD_TABS, TAB_LABEL,
  key, splitKey, normName, iconUrl, codexIconUrl, setLocalIcons, localIconCount, itemUrl, todayISO, addDays, daysBetween, shortDate, prettyDate,
  rangeText, readInventoryCSV, toCSV, readBackupJSON, makeBackupJSON,
} from './logic.js';
import { BIN_INFO, EFFORTS, RECIPE_BOOK } from './gamedata.js';

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
  Wardrobe: ['var(--berry)', 'var(--berry-soft)'], Housing: ['#8A6E55', '#F3EAE0'],
};
const CAT_TAG = { Materials: '', Crops: 'green', Foods: 'orange', Fishes: 'blue', Flowers: 'berry', Artifacts: 'lav', Fragments: 'berry', Clothing: 'berry', Housing: '', Other: '' };
const RARITY_TAG = { Common: '', Uncommon: 'green', Rare: 'blue', 'Very rare': 'lav', Personal: 'personal', Premium: 'premium', Epic: 'lav', Legendary: 'orange' };
const RARITY_STARS = { Personal: ['\u{1F512}', '#9C6B3C'], Premium: ['\u{1F512}', '#B58A1B'], Uncommon: ['\u2605', '#5BC8D8'], Rare: ['\u2605\u2605', '#5BC8D8'], 'Very rare': ['\u2605\u2605', '#F2B632'], Epic: ['\u2605\u2605', '#F2B632'], Legendary: ['\u2605\u2605\u2605', '#F2B632'] };
const TABS = [['Home', 'Spotless Game Guy'], ['Items', 'Gears'], ['Tasks', "Used Gone Fishin'"], ['Bins', 'Carrot Cake'], ['More', 'Used Rubber Duck']];
const MORE_PAGES = ['Grab bins', 'Clothing progress', 'Shopping List', 'Floating Village', 'Global Village', 'Museum', 'Cooking Ingredients', 'All Items', 'Daily Schedule', 'Recipes'];
const PAGE_ICONS = {
  'Grab bins': 'Golden Chest Key', 'Clothing progress': 'Explorer Hat', 'Shopping List': 'Golden Chest Key', 'All Items': 'Used Rubber Duck', 'Floating Village': 'Rainbow Trout', 'Global Village': 'Potato Soup',
  Museum: 'Used Boombox', 'Cooking Ingredients': 'Carrot', 'Daily Schedule': 'Fried Eggs', Recipes: 'Cooking Station',
};
const TITLES = { Home: 'Dashboard', Items: 'My items', Tasks: 'Task list', Bins: 'Contribution bins', More: 'More' };
const SUBTITLES = {
  Home: 'Your event week at a glance', Items: 'Find an item, then tap it to add, set, make or recycle',
  Tasks: 'Where to go next for fish and artifacts, most urgent first', Bins: 'Mark a bin done to take its items out of your bag',
  More: 'Lists, planning and settings',
  'Shopping List': 'Everything you still need to collect, cook or grow', 'All Items': 'Every item the current bins and recipes use',
  'Floating Village': 'Fish and critters for the village bins', 'Global Village': 'Dishes to cook and contribute',
  Museum: 'Toys and artifacts for the museum', 'Cooking Ingredients': 'Raw ingredients \u2013 targets follow the dishes you still need',
  'Daily Schedule': 'Bin requests, day by day', Recipes: 'What every dish needs \u2013 tap one to cook it',
  'Clothing progress': 'Clothing you\u2019re close to completing with pieces',
  'Grab bins': 'Get the live 7 days from the codex, read in your own browser',
};
const LIST_VIEWS = ['Shopping List', 'All Items', ...GROUPS];
const OLD_VIEWS = { Dashboard: 'Home', 'My Items': 'Items', 'Task List': 'Tasks', 'Contribution Bins': 'Bins' };

/** <img> for an item, with a lettered tile if the picture can't load */
function icon(name, size = 28, group = null, cls = 'icon') {
  const [fg, bg] = GROUP_COLORS[group] || ['var(--muted)', '#F3E9DC'];
  const src = iconUrl(name), alt = src.startsWith('icons/') ? codexIconUrl(name) : '';
  return `<img class="${cls}" src="${src}" ${alt ? `data-alt="${alt}"` : ''} onerror="__imgFail(this)" width="${size}" height="${size}" alt="" loading="lazy" decoding="async"
    data-fb=""${esc((name[0] || '?').toUpperCase())}" data-fg="${fg}" data-bg="${bg}" style="width:${size}px;height:${size}px">`;
}
/** A picture didn't load: try the codex copy, then show a lettered tile. */
function imgFail(img) {
  if (!img.isConnected || img.dataset.done) return;
  if (img.dataset.alt) { const a = img.dataset.alt; delete img.dataset.alt; img.src = a; return; }
  img.dataset.done = '1';
  const sp = document.createElement('span');
  sp.className = 'ph ' + img.className;
  sp.textContent = img.dataset.fb;
  sp.style.cssText = `${img.style.cssText};background:${img.dataset.bg};color:${img.dataset.fg};font-size:${parseInt(img.style.width) * 0.45}px`;
  img.replaceWith(sp);
}
window.__imgFail = imgFail;
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.dataset.fb) return;
  imgFail(img);
}, true);
function tileIcon(name, size, group) {
  const [, bg] = GROUP_COLORS[group] || ['', '#F6EEE3'];
  return `<div class="tile-ico" style="width:${size}px;height:${size}px;background:${bg}">${icon(name, Math.round(size * 0.72), group, 'icon')}</div>`;
}
const groupOfCat = (cat) => CATEGORY_GROUP[cat] || null;
const groupOfKey = (k) => splitKey(k)[0];
const nameOfKey = (k) => splitKey(k)[1];
const catOfName = (name) => S.model.categoryOf(name);
function rarityOf(name) { return S.model.rarity(name); }
function rarityTag(r) { return r ? `<span class="tag ${RARITY_TAG[r] || ''}">${esc(r)}</span>` : ''; }

/** One in-game style tile. Tapping it opens the item pop-up. */
function tile({ k, name = nameOfKey(k), group = groupOfKey(k), count, suffix = '', caption = name, sub = '', badge = '', badgeCls = '', dim = false, act = 'open', extra = '' }) {
  const st = RARITY_STARS[rarityOf(name)];
  return `<button class="inv-cell ${dim ? 'zero' : ''}" data-act="${act}" data-key="${esc(k)}" ${extra} title="${esc(name)}">
    <span class="inv">${st ? `<span class="rar" style="color:${st[1]}">${st[0]}</span>` : ''}${badge ? `<span class="tb ${badgeCls}">${esc(badge)}</span>` : ''}
      ${icon(name, 80, group, '')}<span class="count">${esc(count)}${suffix ? `<small>${esc(suffix)}</small>` : ''}</span></span>
    <span class="cap">${esc(caption)}</span>${sub ? `<span class="cap2">${esc(sub)}</span>` : ''}</button>`;
}

// ───────── state ─────────
const saved = JSON.parse(localStorage.getItem('loftia-ui') || '{}');
const S = {
  session: null, model: null, finds: [], updating: false, refreshing: false, updateError: null, sheet: null,
  view: OLD_VIEWS[saved.view] || saved.view || 'Home', back: null,
  ui: Object.assign({ search: '', method: 'All', missingOnly: false, binDay: null, taskFilter: 'All', schedDay: 'All', hideDone: false },
    saved.ui || {}),
};
S.ui.items = Object.assign({ search: '', tab: 'Materials', owned: false, sort: 'az', dir: 1, sub: 'All', rarity: 'All' }, S.ui.items || {});
S.ui.listSort = S.ui.listSort || 'need';
if (S.ui.items.sort === 'rarity') S.ui.items.sort = S.ui.items.dir < 0 ? 'rarity-down' : 'rarity-up';
S.ui.recSort = S.ui.recSort || 'az';
const RARITY_ORDER = ['Common', 'Uncommon', 'Rare', 'Very rare', 'Personal', 'Premium', 'Epic', 'Legendary'];
const CLOTHING_PARTS = ['Hats', 'Tops', 'Bottoms', 'Shoes', 'Accessories', 'Walk Trails'];
const HOUSING_PARTS = ['Stations and Storages', 'Farming', 'Housewares', 'Decorations', 'Wall Decoration', 'Outdoor Decor'];
S.ui.order = S.ui.order || 'az';     // item order setting: 'az' or 'game' (as listed on the codex)
S.ui.taskMode = S.ui.taskMode || 'week';
/** Compare two item names using the item order setting. */
function nameCmp(a, b) {
  if (S.ui.order === 'game') { const x = S.model.orderOf(a), y = S.model.orderOf(b); if (x !== y) return x - y; }
  return a.localeCompare(b);
}
S.ui.search = ''; S.ui.items.search = '';
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
  const close = (v) => { ov.remove(); document.removeEventListener('keydown', keyh); prev?.focus?.(); onClose(v); };
  const keyh = (e) => { if (e.key === 'Escape' && dismiss) { e.preventDefault(); close(null); } };
  document.addEventListener('keydown', keyh);
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

// ───────── saving changes (screen first, server second) ─────────
function rebuild() { S.model.recalc(todayISO()); }
let iconsLoaded = false;
async function loadLocalIcons() {
  if (iconsLoaded) return;
  iconsLoaded = true;
  try {
    const r = await fetch('icons/index.json', { cache: 'no-cache' });
    if (r.ok) setLocalIcons((await r.json()).icons);
  } catch { /* no saved pictures yet - the codex is used */ }
}
async function reloadAll() {
  await loadLocalIcons();
  const d = await db.loadAll();
  const data = d.requests || (await (await fetch('data/seed.json')).json());
  S.model = new Model(data, d.items);
  S.model.setState({ inventory: d.inventory, completions: d.completions });
  S.finds = d.finds;
  S._db = null;
}
async function safely(fn, failMsg) {
  try { await fn(); } catch (e) {
    await infoBox('That didn\u2019t save', `${failMsg}\n\n${e.message}\n\nYour screen has been refreshed with what\u2019s saved.`);
    await reloadAll(); render();
  }
}
/** changes: [{item_key, have}]. Completes any clothing whose pieces are all collected. */
async function setCounts(changes, msg) {
  const proposed = new Map(changes.map((c) => [c.item_key, Math.max(0, c.have)]));
  const { changes: extra, messages } = S.model.completeClothing(proposed);
  for (const c of extra) proposed.set(c.item_key, Math.max(0, c.have));
  for (const [k, v] of proposed) S.model.have.set(k, v);
  rebuild(); refresh();
  const note = [msg, ...messages].filter(Boolean).join(' \u00b7 ');
  if (note) toast(note, messages.length ? '\u2728' : '\u2713');
  await safely(() => db.setInventory([...proposed].map(([item_key, have]) => ({ item_key, have }))), 'Your change couldn\u2019t be saved.');
}

// ───────── shell ─────────
function render() {
  if (!db.configured) { root.innerHTML = setupScreen(); return; }
  if (!S.session) { root.innerHTML = signInScreen(); return; }
  if (!S.model) { root.innerHTML = '<div class="loading">Loading your items\u2026</div>'; return; }
  root.innerHTML = `<div class="app">${header()}<main class="main" id="view"></main>${tabbar()}</div>`;
  renderView();
}
/** Re-draw the current page (and the open pop-up) without losing your place. */
function refresh() {
  if (!$('#view')) return render();
  const y = scrollY;
  $('.tabbar')?.replaceWith(htmlEl(tabbar()));
  $('.hdr')?.replaceWith(htmlEl(header()));
  renderView();
  scrollTo(0, y);
  if (S.sheet) renderSheet();
}
const htmlEl = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
function header() {
  const secondary = !TITLES[S.view];
  return `<header class="hdr"><div class="hdr-in">
    ${secondary ? '<button class="btn icon-btn" data-act="back" aria-label="Back">\u2190</button>' : '<div class="logo-sm" aria-label="Loftia">Loftia</div>'}
    <div class="hdr-t"><h1>${esc(TITLES[S.view] || S.view)}</h1><div class="sub">${esc(SUBTITLES[S.view] || '')}</div></div>
    <button class="btn hdr-up" data-act="update" ${S.updating ? 'disabled' : ''} title="Update bin requests from loftiacodex.com">
      <span aria-hidden="true">\u21bb</span><span class="lbl">${S.updating ? ' Checking\u2026' : ' Update requests'}</span></button></div></header>`;
}
function tabbar() {
  const m = S.model;
  const badges = { Tasks: m.buildTasks().length, Bins: m.openBins(todayISO()).length };
  const active = TITLES[S.view] ? S.view : 'More';
  return `<nav class="tabbar" aria-label="Main"><div class="tabbar-in">${TABS.map(([t, ic]) => `
    <button class="tab ${active === t ? 'on' : ''}" data-act="tab" data-v="${t}" ${active === t ? 'aria-current="page"' : ''}>
      <span class="ti">${icon(ic, 28, null, '')}${badges[t] ? `<span class="badge">${badges[t]}</span>` : ''}</span><span>${t === 'Home' ? 'Home' : t}</span></button>`).join('')}</div></nav>`;
}
function updatedText() {
  if (S.updating) return 'Checking loftiacodex.com for new requests\u2026';
  if (S.updateError) return `Last update failed at ${S.updateError.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} \u00b7 showing saved requests`;
  const at = S.model?.data?.updated_at;
  if (!at) return 'Using the built-in list \u2013 press Update requests';
  const d = new Date(at), t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  const day = todayISO(d), today = todayISO();
  if (day === today) return `Requests updated today at ${t}`;
  if (day === addDays(today, -1)) return `Requests updated yesterday at ${t}`;
  return `Requests updated ${shortDate(day)}`;
}
function renderView() {
  const views = { Home: viewHome, Items: viewItems, Tasks: viewTasks, Bins: viewBins, More: viewMore, 'Daily Schedule': viewSchedule, Recipes: viewRecipes, 'Clothing progress': viewClothingProgress, 'Grab bins': viewGrabBins };
  $('#view').innerHTML = (views[S.view] || viewList)();
  if (S.view === 'Items') fillItems();
  if (LIST_VIEWS.includes(S.view)) fillList();
}
function go(v) { S.view = v; S.ui.search = ''; persist(); render(); scrollTo(0, 0); }

// ───────── Home ─────────
/** A note when the saved requests don't reach a full week ahead, with a button to update. */
function staleBanner() {
  const m = S.model, ds = m.dates(), today = todayISO();
  const at = m.data?.updated_at ? todayISO(new Date(m.data.updated_at)) : '';
  const last = ds[ds.length - 1] || '';
  if (S.updating || (at === today && last >= addDays(today, 6))) return '';
  const why = !ds.length ? 'No upcoming bin requests are saved.' : at !== today ? `Requests were last updated ${at ? shortDate(at) : 'a while ago'}.` : `The saved requests only go to ${shortDate(last)}.`;
  return `<div class="banner"><span class="small">${why} The codex\u2019s saved pages can be a few days old \u2013 use <b>Grab bins</b> on loftiacodex.com for the live week.</span>
    <button class="btn small" data-act="go" data-v="Grab bins">How?</button><button class="btn primary small" data-act="update">\u21bb Update requests</button></div>`;
}
function nextBinDay() {
  const ds = S.model.dates(), t = todayISO();
  if (!ds.length) return [null, []];
  const nd = ds.find((d) => d >= t) || ds[ds.length - 1];
  return [nd, S.model.schedule.filter((r) => r.date === nd)];
}
function requestTile(r) {
  const m = S.model, k = key(r.group, r.name);
  if (m.binDone(r.date, r.bin)) return tile({ k, count: `\u00d7${r.quantity}`, badge: '\u2713 Delivered', badgeCls: 'muted', sub: r.bin, dim: true });
  const [c] = m.binCover(r.date, r.bin, k);
  const ok = c >= r.quantity;
  return tile({ k, count: `\u00d7${r.quantity}`, badge: ok ? '\u2713 Ready' : `${c}/${r.quantity}`, badgeCls: ok ? 'green' : 'orange', sub: r.bin });
}
function viewHome() {
  const m = S.model;
  const need = m.items.reduce((t, i) => t + m.required(i), 0), miss = m.items.reduce((t, i) => t + m.missing(i), 0);
  const pct = need ? Math.round((100 * (need - miss)) / need) : 100;
  const ds = m.dates();
  const contrib = m.items.filter((i) => i.group !== 'Cooking Ingredients'), raw = m.items.filter((i) => i.group === 'Cooking Ingredients');
  const done = m.items.filter((i) => m.missing(i) === 0).length;
  const stats = [
    ['Contribution units left', contrib.reduce((t, i) => t + m.missing(i), 0), 'fish, dishes and artifacts', 'var(--orange-dk)', 'Shopping List'],
    ['Raw ingredients left', raw.reduce((t, i) => t + m.missing(i), 0), 'to grow, gather or buy', 'var(--green)', 'Cooking Ingredients'],
    ['Items complete', done, `of ${m.items.length} item types`, 'var(--blue)', 'All Items'],
    ['Items still missing', m.items.length - done, 'on your shopping list', 'var(--berry)', 'Shopping List'],
  ];
  const villages = GROUPS.map((g) => {
    const arr = m.items.filter((i) => i.group === g);
    const n = arr.reduce((t, i) => t + m.required(i), 0), ms = arr.reduce((t, i) => t + m.missing(i), 0);
    const p = n ? Math.round((100 * (n - ms)) / n) : 100;
    const [fg] = GROUP_COLORS[g];
    return `<button class="village" data-act="go" data-v="${esc(g)}">${tileIcon(PAGE_ICONS[g], 46, g)}
      <span><span class="vname">${esc(g)}</span><span class="bar" style="margin-top:6px"><i style="width:${p}%;background:${fg}"></i></span>
      <span class="small muted">${ms ? `${fmt(ms)} still needed` : 'All done!'}</span></span><b style="color:${fg}">${p}%</b></button>`;
  }).join('');
  const [nd, entries] = nextBinDay();
  const tasks = m.buildTasks(), t = tasks[0];
  return `${staleBanner()}<section class="hero"><div><div class="hero-l">Upcoming bin requests</div>
      <div class="when">${ds.length ? rangeText(ds[0], ds[ds.length - 1]) : 'No requests yet'}</div><div class="hero-l">${esc(updatedText())}</div></div>
      <div class="pct"><b>${pct}%</b><div class="hero-l">overall complete</div><div class="bar"><i style="width:${pct}%"></i></div></div></section>
    <div class="stats">${stats.map(([l, v, s, c, page]) => `<button class="card stat" data-act="go" data-v="${page}">
      <span class="small muted"><span class="dot" style="background:${c}"></span> ${esc(l)}</span><b style="color:${c}">${fmt(v)}</b><span class="small muted">${esc(s)}</span></button>`).join('')}</div>
    <div class="card"><div class="row-h"><h3 class="cardtitle">Next bin requests</h3><span class="muted small">${nd ? prettyDate(nd) : ''}</span>
      <button class="btn small" data-act="open-bins" data-d="${nd || ''}">Open bins</button></div>
      <div class="inv-grid sm">${entries.map(requestTile).join('') || '<div class="muted small">Nothing requested.</div>'}</div></div>
    <div class="card"><div class="row-h"><h3 class="cardtitle">Next task</h3>${t ? dueTag(t.deadline) : ''}<button class="btn small" data-act="tab" data-v="Tasks">Open tasks</button></div>
      ${t ? `<div class="task-where">${esc(taskTitle(t))} \u2013 ${esc(taskSub(t))}</div><div class="inv-grid sm">${t.items.slice(0, 8).map((e) => taskTile(e)).join('')}</div>`
      : '<div class="muted small">Nothing left to collect \u2013 every open bin has its fish and artifacts covered.</div>'}</div>
    ${clothingProgressHTML(6)}
    <div class="card"><h3 class="cardtitle">Progress by village</h3><div class="villages">${villages}</div></div>`;
}

// ───────── Items (add / find anything) ─────────
/** A compact dropdown that looks like a filter chip (no sideways scrolling). */
function selectChip(id, label, options, value, allValue = 'All') {
  return `<label class="chip select-chip ${value !== allValue ? 'on' : ''}"><span class="sel-l">${esc(label)}</span>
    <select id="${id}" aria-label="${esc(label)}">${options.map(([v, l]) => `<option value="${esc(v)}" ${value === v ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></label>`;
}
const ITEM_SORTS_REST = [ ['most', 'Most first'], ['fewest', 'Fewest first'], ['rarity-up', 'Rarity: common first'], ['rarity-down', 'Rarity: rarest first']];
function viewItems() {
  const u = S.ui.items;
  if (!S._db || S._db.model !== S.model) S._db = { model: S.model, rows: S.model.database() };
  return `<div class="sticky-tools">
      <label class="search"><span aria-hidden="true">\u2315</span><input id="items-search" type="search" placeholder="Type to find an item" value="${esc(u.search)}" aria-label="Search items" autocomplete="off" enterkeyhint="search">
        <button class="x" data-act="items-clear" aria-label="Clear search">\u2715</button></label>
      <div class="chips wrap" role="tablist">${['All', ...ADD_TABS].map((c) => `<button class="chip ${u.tab === c ? 'on' : ''}" role="tab" data-act="items-tab" data-v="${c}">${esc(TAB_LABEL[c] || c)}<span class="n"></span></button>`).join('')}</div>
      <div class="filters" id="items-filters"></div></div>
    <div id="items-extra"></div><p class="note" id="items-note"></p><div id="items-grid" class="inv-grid"></div>`;
}
function itemRows() {
  const m = S.model, u = S.ui.items;
  if (!S._db || S._db.model !== m) S._db = { model: m, rows: m.database() };
  const inTab = (r) => u.tab === 'All' || r.category === u.tab || (u.tab === 'Crops' && r.category === 'Flowers');
  const bySub = u.tab === 'Clothing' || u.tab === 'Housing';
  const inSub = (r) => u.sub === 'All' || (bySub ? r.sub === u.sub : r.kind === u.sub);
  const toks = normName(u.search).split(' ').filter(Boolean);
  const matches = (r) => toks.every((t) => r.search.includes(t));
  const owned = (r) => !u.owned || m.get(r.key) > 0;
  const rar = (r) => u.rarity === 'All' || (u.rarity === 'Unknown' ? !m.rarity(r.name) : m.rarity(r.name) === u.rarity);
  const counts = {}, subCounts = {}, rarCounts = {};
  for (const r of S._db.rows) {
    if (!matches(r) || !owned(r)) continue;
    if (rar(r)) { const c = r.category === 'Flowers' ? 'Crops' : r.category; counts[c] = (counts[c] || 0) + 1; counts.All = (counts.All || 0) + 1; }
    if (!inTab(r)) continue;
    if (rar(r)) { const v = bySub ? r.sub : r.kind; if (v) subCounts[v] = (subCounts[v] || 0) + 1; }
    if (inSub(r)) { const rr = m.rarity(r.name) || 'Unknown'; rarCounts[rr] = (rarCounts[rr] || 0) + 1; }
  }
  const rows = S._db.rows.filter((r) => matches(r) && owned(r) && rar(r) && inTab(r) && inSub(r));
  const nm = (a, b) => nameCmp(a.name, b.name);
  const by = {
    az: nm, game: (a, b) => m.orderOf(a.name) - m.orderOf(b.name) || a.name.localeCompare(b.name), most: (a, b) => m.get(b.key) - m.get(a.key) || nm(a, b), fewest: (a, b) => m.get(a.key) - m.get(b.key) || nm(a, b),
    'rarity-up': (a, b) => m.rarityRank(a.name) - m.rarityRank(b.name) || nm(a, b),
    'rarity-down': (a, b) => { const x = m.rarityRank(a.name), y = m.rarityRank(b.name), n = RARITY_ORDER.length; return (y >= n ? -1 : y) - (x >= n ? -1 : x) || nm(a, b); },
  };
  rows.sort(by[u.sort] || by.az);
  return { rows, counts, toks, subCounts, rarCounts };
}
/** Groups inside a tab: clothing parts, raw / refined materials, cooked food. */
function subOptions(tab, subCounts = {}) {
  if (tab === 'Clothing') return CLOTHING_PARTS;
  if (tab === 'Housing') return [...HOUSING_PARTS, ...Object.keys(subCounts).filter((k) => !HOUSING_PARTS.includes(k))];
  if (tab === 'Materials') return ['Raw materials', 'Refined materials'];
  if (tab === 'All') return ['Raw materials', 'Refined materials', 'Cooked food'];
  return [];
}
function itemTile(r) {
  const m = S.model, n = m.get(r.key);
  const p = m.pieceOf.get(r.name);
  if (p) return tile({ k: r.key, name: r.name, count: fmt(n), suffix: `/${p.qty}`, dim: !n, caption: r.name.replace(/\s*\(piece\)$/i, ''), sub: 'pieces' });
  if (r.category === 'Clothing') {
    const pc = m.piecesFor.get(r.name);
    const pieces = pc ? m.get(m.keyForName(pc.piece)) : 0;
    return tile({ k: r.key, name: r.name, count: n ? '\u2713' : '', badge: !n && pieces ? `${pieces}/${pc.qty}` : '', badgeCls: 'orange', dim: !n, sub: r.sub || '' });
  }
  const can = m.recipesFor(r.name).length ? m.maxMake(r.name) : 0;
  return tile({ k: r.key, name: r.name, count: fmt(n), dim: !n, badge: can ? `make ${can}` : '', badgeCls: 'green',
    sub: r.category === 'Housing' ? r.sub : (r.kind && S.ui.items.tab === 'All' ? r.kind.replace(' materials', '') : '') });
}
/** Clothing you're close to completing: tiles showing pieces you have, or pieces still needed. */
function clothingProgressHTML(limit = 0) {
  const m = S.model, list = m.clothingProgress(), mode = S.ui.cpMode || 'have';
  if (!list.length) return '';
  const shown = limit ? list.slice(0, limit) : list;
  return `<div class="card cp"><div class="row-h"><h3 class="cardtitle">Almost complete clothing</h3>
      <div class="seg small-seg" role="radiogroup" aria-label="Show">${[['have', 'Pieces I have'], ['left', 'Pieces still needed']].map(([v, l]) => `<button role="radio" aria-checked="${mode === v}" class="${mode === v ? 'on' : ''}" data-act="cp-mode" data-v="${v}">${l}</button>`).join('')}</div></div>
    <div class="inv-grid sm">${shown.map((c) => tile({
      k: m.keyForName(c.piece), name: c.clothing, caption: c.clothing,
      count: mode === 'have' ? `${c.have}` : `${c.left}`, suffix: mode === 'have' ? `/${c.need}` : ' left',
      badge: `${Math.round(c.pct * 100)}%`, badgeCls: c.pct >= 0.75 ? 'green' : 'orange', sub: m.sub.get(c.clothing) || '',
    })).join('')}</div>
    ${limit && list.length > limit ? `<button class="btn small" style="margin-top:10px" data-act="cp-all">See all ${list.length}</button>` : ''}</div>`;
}
function fillItems() {
  const u = S.ui.items, m = S.model;
  const { rows, counts, toks, subCounts, rarCounts } = itemRows();
  const subs = subOptions(u.tab, subCounts);
  if (u.sub !== 'All' && !subs.includes(u.sub)) { u.sub = 'All'; return fillItems(); }
  $$('[data-act="items-tab"]').forEach((b) => { $('.n', b).textContent = counts[b.dataset.v] || 0; });
  const hasKinds = u.tab === 'Clothing' || u.tab === 'Housing' || Object.keys(subCounts).length;
  const rarOpts = [['All', 'All rarities'], ...RARITY_ORDER.filter((r) => rarCounts[r]).map((r) => [r, `${r} (${rarCounts[r]})`]),
    ...(rarCounts.Unknown ? [['Unknown', `Not read yet (${rarCounts.Unknown})`]] : [])];
  if (u.rarity !== 'All' && !rarOpts.some(([v]) => v === u.rarity)) rarOpts.push([u.rarity, `${u.rarity} (0)`]);
  $('#items-filters').innerHTML = [
    subs.length && hasKinds ? selectChip('items-sub', 'Group', [['All', u.tab === 'All' ? 'Everything' : `All ${(TAB_LABEL[u.tab] || u.tab).toLowerCase()}`], ...subs.map((v) => [v, `${v} (${subCounts[v] || 0})`])], u.sub) : '',
    selectChip('items-rarity', 'Rarity', rarOpts, u.rarity),
    selectChip('items-sort', 'Sort', [['az', S.ui.order === 'game' ? 'Game order' : 'A\u2013Z'], ...ITEM_SORTS_REST], u.sort === 'game' ? 'az' : u.sort, 'az'),
    `<button class="chip ${u.owned ? 'on' : ''}" data-act="items-owned">Only mine</button>`,
  ].join('');
  $('#items-extra').innerHTML = u.tab === 'Clothing' && !toks.length ? clothingProgressHTML(6) : '';
  const needsData = ['Fragments', 'Clothing', 'Housing'].includes(u.tab) && !m.catalog[u.tab]?.length;
  const unread = (u.rarity !== 'All' || u.sort.startsWith('rarity') || u.sub !== 'All') && rarCounts.Unknown;
  $('#items-note').innerHTML = needsData ? '' : rows.length
    ? `${plural(rows.length, 'item')}${u.owned ? ' you have' : ''}. Tap one to add, set, make or recycle.${unread ? ` <span class="warn-inline">Some items haven\u2019t been read from the codex yet \u2013 <button class="linkish" data-act="refresh-items">Refresh item data</button></span>` : ''}`
    : (toks.length ? 'No matches \u2013 try fewer letters or another tab.' : 'Nothing here yet.');
  $('#items-grid').innerHTML = needsData
    ? `<div class="card empty-card"><b>${u.tab} haven\u2019t been loaded yet</b><p class="small muted">Go to More \u2192 Refresh item data. It reads the codex once to get every item\u2019s rarity, type, recipes, clothing and pieces.</p>
        <button class="btn primary" data-act="refresh-items">Refresh item data now</button></div>`
    : rows.map(itemTile).join('');
}

// ───────── the item pop-up ─────────
function openSheet(k, ctx = null) {
  S.sheet = { key: k, ctx, mode: ctx === 'task' ? 'add' : (S.sheet?.mode || 'add'), makeN: 1, recN: 1 };
  if (!$('.sheet-ov')) {
    const ov = document.createElement('div');
    ov.className = 'sheet-ov';
    ov.innerHTML = '<div class="sheet" role="dialog" aria-modal="true"><div class="grab" aria-hidden="true"></div><button class="x-close" data-act="sheet-close" aria-label="Close">\u2715</button><div class="sheet-body"></div></div>';
    ov.addEventListener('mousedown', (e) => { if (e.target === ov) closeSheet(); });
    document.body.appendChild(ov);
    document.body.classList.add('noscroll');
    requestAnimationFrame(() => ov.classList.add('open'));
  }
  renderSheet();
  if (matchMedia('(pointer: fine)').matches) setTimeout(() => $('#sh-qty')?.focus({ preventScroll: true }), 60);   // no surprise keyboard on phones
}
function closeSheet() { S.sheet = null; $('.sheet-ov')?.remove(); document.body.classList.remove('noscroll'); }
function renderSheet() {
  const sh = S.sheet, m = S.model, body = $('.sheet-body');
  if (!sh || !body) return;
  const k = sh.key, [g, name] = splitKey(k), have = m.get(k);
  const cat = m.categoryOf(name), item = m.byKey.get(k), info = m.itemInfo(name), det = m.details(name);
  const where = [info.location, info.district].filter(Boolean).join(', ');
  const chips = [`<span class="tag ${CAT_TAG[cat] || ''}">${esc(TAB_LABEL[cat] || cat)}</span>`, m.sub.get(name) && m.sub.get(name) !== cat ? `<span class="tag">${esc(m.sub.get(name))}</span>` : '',
    item ? `<span class="tag">${esc(item.method)}</span>` : '', m.station(item) ? `<span class="tag blue">Station Lv ${m.station(item)}</span>` : '',
    rarityTag(rarityOf(name)), det.type ? `<span class="tag">${esc(det.type)}</span>` : '', det.theme ? `<span class="tag">Theme: ${esc(det.theme)}</span>` : ''].join('');
  const untradable = ['Personal', 'Premium'].includes(rarityOf(name));
  let need = '';
  if (item && m.required(item)) {
    const req = m.required(item), ms = m.missing(item), pct = Math.round((100 * Math.min(have, req)) / req);
    need = `<div class="sec"><div class="row-h"><b class="small">Needed for bins and recipes</b><span class="small" style="color:${ms ? 'var(--orange-dk)' : 'var(--green)'};font-weight:800">${ms ? `${ms} more to go` : 'All set \u2713'}</span></div>
      <div class="bar"><i style="width:${pct}%;background:${ms ? 'var(--orange)' : 'var(--green)'}"></i></div><div class="tiny muted" style="margin-top:4px">${have} in your bag \u00b7 ${req} needed</div></div>`;
  }
  let pieces = '';
  const pOf = m.pieceOf.get(name), pFor = m.piecesFor.get(name);
  if (pOf) pieces = `<div class="sec"><b class="small">Pieces for ${esc(pOf.clothing)}</b><div class="bar" style="margin-top:6px"><i style="width:${Math.min(100, (100 * have) / pOf.qty)}%;background:var(--berry)"></i></div>
    <div class="tiny muted" style="margin-top:4px">${have} of ${pOf.qty}. When you reach ${pOf.qty}, ${esc(pOf.clothing)} is completed and the pieces are used up.</div></div>`;
  else if (pFor) { const ph = m.get(m.keyForName(pFor.piece)); pieces = `<div class="sec"><b class="small">Made from ${pFor.qty} pieces</b><div class="req-row" data-act="open" data-key="${esc(m.keyForName(pFor.piece))}" style="cursor:pointer">${icon(pFor.piece, 30, 'Wardrobe')}<span class="grow">${esc(pFor.piece)}</span><b class="small">${ph}/${pFor.qty}</b></div></div>`; }
  const isTask = sh.ctx === 'task';
  const qty = `<div class="sec"><div class="have-big"><b>${fmt(have)}</b><span>${cat === 'Clothing' ? (have ? 'owned' : 'not owned yet') : 'in your bag'}</span></div>
    <div class="seg" role="radiogroup">${[['add', isTask ? 'Found' : 'Add amount'], ['set', 'Set total']].map(([v, l]) => `<button role="radio" aria-checked="${sh.mode === v}" class="${sh.mode === v ? 'on' : ''}" data-act="sheet-mode" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="qty-row"><input id="sh-qty" class="qty-input" type="number" inputmode="numeric" min="0" placeholder="${sh.mode === 'add' ? 'How many?' : String(have)}" aria-label="${sh.mode === 'add' ? 'Amount to add' : 'New total'}">
      <button class="btn primary" data-act="sheet-save">${sh.mode === 'add' ? (isTask ? 'Log find' : 'Add') : 'Save'}</button></div>
    <div class="tiny muted" id="sh-msg">${sh.mode === 'add' ? 'Type how many you got and press Enter.' : 'Type the new total and press Enter.'}</div>
    <div class="quick">${[[-1, '\u2212 1'], [1, '+ 1'], [5, '+ 5'], [10, '+ 10']].map(([d, l]) => `<button class="btn" data-act="sheet-delta" data-d="${d}">${l}</button>`).join('')}</div></div>`;
  const make = m.recipesFor(name).map((r, idx) => {
    const max = m.maxMake(name, idx), n = Math.max(1, Math.min(sh.makeN, Math.max(1, max)));
    const missing = r.inputs.map((x) => [x, Math.max(0, x.qty * n - m.get(m.keyForName(x.name)))]).filter(([, s]) => s > 0);
    return `<div class="sec"><div class="row-h"><b class="small">${r.station === 'Cooking Station' ? 'Cook' : 'Make'} at ${esc(r.station || 'a station')}${r.level ? ` Lv ${r.level}` : ''}</b>
        <span class="tiny muted">makes ${r.out || 1}</span></div>
      <div class="ing-list">${r.inputs.map((x) => { const hk = m.keyForName(x.name), h = m.get(hk); return `<button class="ing" data-act="open" data-key="${esc(hk)}">${icon(x.name, 30, groupOfCat(m.categoryOf(x.name)))}<span class="grow">${esc(x.name)}</span><span class="tiny ${h >= x.qty * n ? 'ok' : 'short'}">${h} / ${x.qty * n}</span></button>`; }).join('')}</div>
      <div class="make-row"><div class="stepper"><button class="btn" data-act="make-n" data-d="-1" aria-label="Fewer">\u2212</button><b>${n}</b><button class="btn" data-act="make-n" data-d="1" aria-label="More">+</button></div>
        <button class="btn primary" data-act="sheet-make" data-i="${idx}" ${max >= n ? '' : 'disabled'}>${r.station === 'Cooking Station' ? 'Cook' : 'Make'} ${n}</button></div>
      <div class="tiny ${max ? 'ok' : 'short'}">${max ? `You can make ${max} now. Ingredients are taken out of your bag.` : `Missing ${missing.map(([x, s]) => `${s} ${x.name}`).join(', ')}`}</div></div>`;
  }).join('');
  const rec = m.recycleFor(name);
  const recycle = rec.length ? `<div class="sec"><b class="small">Recycle into</b><div class="ing-list">${rec.map((x) => `<div class="ing">${icon(x.name, 30, groupOfCat(m.categoryOf(x.name)))}<span class="grow">${esc(x.name)}</span><span class="tiny">\u00d7${x.qty * sh.recN}</span></div>`).join('')}</div>
    <div class="make-row"><div class="stepper"><button class="btn" data-act="rec-n" data-d="-1" aria-label="Fewer">\u2212</button><b>${sh.recN}</b><button class="btn" data-act="rec-n" data-d="1" aria-label="More">+</button></div>
      <button class="btn" data-act="sheet-recycle" ${have >= sh.recN ? '' : 'disabled'}>Recycle ${sh.recN}</button></div></div>` : '';
  let rel = '';
  if (item && item.group === 'Cooking Ingredients') {
    const uses = m.usesOf(name);
    if (uses.length) rel = `<div class="sec"><b class="small">Used in</b><div class="ing-list">${uses.map((r) => { const d = m.item('Global Village', r.dish); const l = d ? m.missing(d) : 0; return `<button class="ing" data-act="open" data-key="${esc(key('Global Village', r.dish))}">${icon(r.dish, 30, 'Global Village')}<span class="grow">${esc(r.dish)}</span><span class="tiny muted">\u00d7${r.per} \u00b7 ${l ? `${l} to cook` : 'done'}</span></button>`; }).join('')}</div></div>`;
  } else if (item) {
    const reqs = m.requestsFor(item);
    if (reqs.length) rel = `<div class="sec"><b class="small">Bin requests</b>${reqs.map((r) => `<div class="req-row small"><span class="grow">${shortDate(r.date)} \u00b7 ${esc(r.bin)}</span><b>\u00d7${r.quantity}${m.binDone(r.date, r.bin) ? ' \u2713' : ''}</b></div>`).join('')}</div>`;
  }
  body.innerHTML = `<div class="sh-head">${tileIcon(name, 84, g)}<div><h3>${esc(name)}</h3><div class="chips">${chips}</div>
      ${where ? `<div class="tiny muted" style="margin-top:6px">Found at ${esc(where)}</div>` : ''}
      ${untradable ? `<div class="tiny" style="margin-top:6px;color:#9C6B3C;font-weight:800">\u{1F512} ${esc(rarityOf(name))} item \u2013 it can\u2019t be given away</div>` : ''}</div></div>
    ${need}${pieces}${qty}${make}${recycle}${rel}
    <div class="sec" style="border:0"><a class="linkish small" href="${itemUrl(name)}" target="_blank" rel="noopener">Open on loftiacodex.com \u2197</a></div>`;
}
async function sheetSave() {
  const sh = S.sheet, inp = $('#sh-qty'), msg = $('#sh-msg');
  const n = Number(String(inp.value).replace(/,/g, '').trim());
  if (inp.value.trim() === '' || !Number.isInteger(n) || n < 0 || (sh.mode === 'add' && n === 0)) {
    msg.textContent = sh.mode === 'add' ? 'Type a whole number of 1 or more.' : 'Type a whole number (0 or more).'; msg.style.color = 'var(--berry)'; inp.focus(); return;
  }
  const k = sh.key, name = nameOfKey(k), have = S.model.get(k);
  if (sh.mode === 'add' && sh.ctx === 'task') return logFind(k, n);
  if (sh.mode === 'add') await setCounts([{ item_key: k, have: have + n }], `+${fmt(n)} ${name}`);
  else await setCounts([{ item_key: k, have: n }], `${name}: ${fmt(n)}`);
  const i2 = $('#sh-qty'); if (i2) { i2.value = ''; if (matchMedia('(pointer: fine)').matches) i2.focus({ preventScroll: true }); else i2.blur(); }
}

// ───────── item lists (Shopping List, villages, ingredients) ─────────
function viewList() {
  const m = S.model, cat = S.view;
  const methods = [...new Set(m.rows(cat).map((i) => i.method))].sort();
  if (methods.includes('Cook')) methods.splice(methods.indexOf('Cook') + 1, 0, 'Can cook');
  if (!['All', ...methods].includes(S.ui.method)) S.ui.method = 'All';
  const canCook = m.items.filter((i) => m.cookable(i) > 0).length;
  const sorts = listSorts(cat);
  if (!sorts.some(([v]) => v === S.ui.listSort)) S.ui.listSort = 'need';
  return `<div class="sticky-tools"><label class="search"><span aria-hidden="true">\u2315</span><input id="list-search" type="search" placeholder="Type to find an item" value="${esc(S.ui.search)}" aria-label="Search items" autocomplete="off" enterkeyhint="search">
        <button class="x" data-act="list-clear" aria-label="Clear search">\u2715</button></label>
      <div class="filters">${selectChip('list-method', 'Show', [['All', 'Everything'], ...methods.map((x) => [x, x === 'Can cook' ? `Can cook (${canCook})` : x])], S.ui.method)}
        ${selectChip('list-sort', 'Sort', sorts, S.ui.listSort, 'need')}
        ${cat !== 'Shopping List' ? `<button class="chip ${S.ui.missingOnly ? 'on' : ''}" data-act="missing">Missing only</button>` : ''}</div></div>
    <p class="note" id="list-note"></p><div class="inv-grid" id="list-grid"></div>`;
}
function listSorts(cat) {
  const out = [['need', 'Most needed'], ['az', S.ui.order === 'game' ? 'Game order' : 'A\u2013Z'], ['have', 'Most in bag'], ['rarity', 'Rarity: common first'], ['rarity-down', 'Rarity: rarest first']];
  if (cat === 'Global Village' || cat === 'All Items' || cat === 'Shopping List' || S.ui.method === 'Can cook') out.push(['station', 'Cooking station']);
  return out;
}
function fillList() {
  const m = S.model, cat = S.view, toks = normName(S.ui.search).split(' ').filter(Boolean);
  let rows = m.rows(cat).filter((i) => toks.every((t) => normName(`${i.name} ${i.group}`).includes(t))
    && (S.ui.method === 'All' || i.method === S.ui.method || (S.ui.method === 'Can cook' && m.cookable(i) > 0))
    && (!S.ui.missingOnly || cat === 'Shopping List' || m.missing(i) > 0));
  const sorts = listSorts(cat).map(([v]) => v);
  if (!sorts.includes(S.ui.listSort)) S.ui.listSort = 'need';
  const nm = (a, b) => nameCmp(a.name, b.name);
  const by = {
    need: (a, b) => m.missing(b) - m.missing(a) || nm(a, b), az: nm, have: (a, b) => m.haveOf(b) - m.haveOf(a) || nm(a, b),
    rarity: (a, b) => m.rarityRank(a.name) - m.rarityRank(b.name) || nm(a, b),
    'rarity-down': (a, b) => { const x = m.rarityRank(a.name), y = m.rarityRank(b.name), n = RARITY_ORDER.length; return (y >= n ? -1 : y) - (x >= n ? -1 : x) || nm(a, b); },
    station: (a, b) => (m.station(a) || 9) - (m.station(b) || 9) || nm(a, b),
  };
  rows.sort(by[S.ui.method === 'Can cook' && S.ui.listSort === 'need' ? 'station' : S.ui.listSort]);
  const left = rows.reduce((t, i) => t + m.missing(i), 0);
  $('#list-note').textContent = S.ui.method === 'Can cook' && !rows.length
    ? 'Nothing to cook yet \u2013 you\u2019re missing at least one raw ingredient for every dish.'
    : `${plural(rows.length, 'item')} \u00b7 ${fmt(left)} still needed${S.ui.method === 'Can cook' ? ' \u00b7 lowest Cooking Station first' : ''}. Tap an item for details.`;
  $('#list-grid').innerHTML = rows.map((i) => {
    const k = key(i.group, i.name), n = m.missing(i), ck = m.cookable(i);
    const badge = S.ui.method === 'Can cook' ? `Lv ${m.station(i) || '?'} \u00b7 cook ${ck}` : n ? `need ${n}` : '\u2713';
    return tile({ k, count: fmt(m.haveOf(i)), badge, badgeCls: S.ui.method === 'Can cook' ? 'green' : n ? 'orange' : 'green', dim: n === 0 && S.ui.method !== 'Can cook', sub: `${m.haveOf(i)} / ${m.required(i)}${ck && S.ui.method !== 'Can cook' ? ` \u00b7 can cook ${ck}` : ''}` });
  }).join('') || '<div class="empty">No items match.</div>';
}

// ───────── Bins ─────────
function viewBins() {
  const m = S.model, dates = m.dates(), today = todayISO();
  if (!dates.length) return staleBanner() || '<div class="card empty">No upcoming bin requests \u2013 press Update requests.</div>';
  if (!dates.includes(S.ui.binDay)) S.ui.binDay = dates.includes(today) ? today : (dates.find((d) => d >= today) || dates[dates.length - 1]);
  const day = S.ui.binDay;
  const chips = dates.map((d) => {
    const bins = [...new Set(m.schedule.filter((r) => r.date === d).map((r) => r.bin))];
    const done = bins.filter((b) => m.binDone(d, b)).length;
    return `<button class="chip ${d === day ? 'on' : ''} ${d < today ? 'past' : ''}" data-act="bin-day" data-d="${d}">${d === today ? 'Today' : shortDate(d)}<span class="n">${done < bins.length ? `${done}/${bins.length}` : '\u2713'}</span></button>`;
  }).join('');
  const open = m.openBins(day), expired = m.isExpired(day), ready = open.filter((b) => m.binReady(day, b));
  const note = expired ? 'This day has passed \u2013 requests that weren\u2019t marked done have expired.'
    : open.length ? `${plural(open.length, 'bin')} left, ${ready.length} ready. A bin can be marked done only when every item is in your bag.` : 'Every bin is done for this day \u2713';
  const sections = EFFORTS.map(([group, effort]) => {
    const labels = Object.keys(BIN_INFO).filter((b) => b.startsWith(group));
    const withReq = labels.filter((b) => m.binEntries(day, b).length);
    return `<div class="effort">${tileIcon(PAGE_ICONS[group], 36, group)}<h2>${esc(effort)}</h2><span class="muted small">${withReq.filter((b) => m.binDone(day, b)).length}/${withReq.length} done</span></div>
      <div class="bins-row">${labels.map((b) => binCard(day, b)).join('')}</div>`;
  }).join('');
  return `${staleBanner()}<div class="chips wrap" style="margin-bottom:10px">${chips}</div>
    <div class="row-h" style="margin-bottom:4px"><h2 class="section" style="margin:0">${prettyDate(day)}</h2>
      ${ready.length && !expired ? `<button class="btn primary small" data-act="mark-day" data-d="${day}">\u2713 Mark all ready bins done</button>` : ''}</div>
    <p class="note">${esc(note)}</p>${sections}`;
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
  const ents = entries.map((e) => {
    if (done) return tile({ k: e.key, count: `\u00d7${e.qty}`, badge: `${removed[e.key] || 0} used`, badgeCls: 'muted', dim: true });
    if (expired) return tile({ k: e.key, count: `\u00d7${e.qty}`, dim: true });
    const [c, q] = m.binCover(day, bin, e.key);
    return tile({ k: e.key, count: `\u00d7${e.qty}`, badge: c >= q ? '\u2713' : `${c}/${q}`, badgeCls: c >= q ? 'green' : 'orange' });
  }).join('');
  let act = '';
  if (done) act = `<button class="btn small" data-act="undo-bin" data-d="${day}" data-b="${esc(bin)}" title="Put the items back in your bag">Undo</button>`;
  else if (entries.length && !expired) act = `<button class="btn small ${ready ? 'primary' : ''}" data-act="mark-bin" data-d="${day}" data-b="${esc(bin)}" ${ready ? '' : `disabled title="Collect ${short} more first"`}>\u2713 Done</button>`;
  return `<div class="card bin ${done ? 'done' : ''} ${expired ? 'expired' : ''}"><div class="head"><span class="tag" style="background:${soft};color:${fg}">${esc(lv)}</span><b>${esc(loc)}</b>${chip}</div>
    ${entries.length ? `<div class="bin-body"><div class="bin-tiles">${ents}</div>${act ? `<div class="bin-act">${act}</div>` : ''}</div>` : '<div class="small muted">No requests this day</div>'}</div>`;
}

// ───────── Tasks ─────────
function dueText(day) { const n = daysBetween(todayISO(), day); return n <= 0 ? 'Due today' : n === 1 ? 'Due tomorrow' : `Due ${shortDate(day)}`; }
function dueTag(day) { const n = daysBetween(todayISO(), day); return `<span class="tag ${n <= 0 ? 'berry' : n === 1 ? 'orange' : 'blue'}">${dueText(day)}</span>`; }
const taskTitle = (t) => (t.district ? `Go to ${t.district}` : t.location ? `Go to ${t.location}` : 'Location not listed');
const taskSub = (t) => (t.location && t.district ? `find these at ${t.location}` : t.district ? 'the exact spot isn\u2019t listed on the codex' : 'press Update requests to look these up');
function taskTile(e) {
  return tile({ k: e.key, count: `\u00d7${e.short}`, badge: e.bonus ? `later \u00b7 ${shortDate(e.due).split(' ').slice(1).join(' ')}` : (e.rarity || ''), badgeCls: e.bonus ? 'blue' : (RARITY_TAG[e.rarity] || 'muted'), extra: 'data-ctx="task"', sub: e.bonus ? 'while you\u2019re here' : '' });
}
function viewTasks() {
  const m = S.model, f = S.ui.taskFilter;
  const groups = f === 'All' ? TASK_GROUPS : [f];
  const mode = S.ui.taskMode;
  const tasks = m.buildTasks(groups, mode);
  const nItems = tasks.reduce((t, x) => t + x.items.length, 0);
  const hasPools = Object.keys(m.pools).length > 0;
  const missing = m.missingInfo().filter((i) => groups.includes(i.group));
  let last = null, n = 0;
  const body = tasks.map((t) => {
    n++;
    const head = mode === 'all' ? (n === 1 ? '<h2 class="section">Stock up for every request</h2>' : '') : t.deadline !== last ? `<h2 class="section">${prettyDate(t.deadline)} \u2013 ${dueText(t.deadline)}</h2>` : '';
    last = t.deadline;
    const main = t.items.filter((e) => !e.bonus).length, bonus = t.items.length - main;
    return `${head}<div class="card task"><div class="th"><div class="num ${t.known ? '' : 'unknown'}">${n}</div><div class="titles">
        <h3 class="cardtitle">${esc(taskTitle(t))}</h3><div class="small muted">${esc(taskSub(t).replace(/^./, (c) => c.toUpperCase()))}. ${mode === 'all' ? plural(t.items.length, 'item') : `${main} due${bonus ? `, plus ${bonus} extra while you\u2019re here` : ''}`}.</div></div>${mode === 'all' ? '' : dueTag(t.deadline)}</div>
      <div class="inv-grid sm">${t.items.map(taskTile).join('')}</div></div>`;
  }).join('');
  const finds = S.finds.slice(0, 12);
  return `<div class="row-h" style="margin-bottom:10px"><div class="seg small-seg" role="radiogroup" aria-label="Plan for">${[['week', 'Next 7 days'], ['all', 'Every request']].map(([v, l]) => `<button role="radio" aria-checked="${mode === v}" class="${mode === v ? 'on' : ''}" data-act="task-mode" data-v="${v}">${l}</button>`).join('')}</div>
      <div class="chips">${['All', ...TASK_GROUPS].map((x) => `<button class="chip ${f === x ? 'on' : ''}" data-act="task-filter" data-v="${x}">${x}</button>`).join('')}</div>
      <span class="small muted">${plural(tasks.length, 'stop')}, ${plural(nItems, 'item')} to find</span></div>
    <p class="note">${mode === 'all' ? (hasPools ? 'Everything it takes to fill every request in each bin\u2019s rotation once, so you\u2019re ready whatever comes up. ' : 'Press Update requests to load each bin\u2019s full list of requests. ') : 'What the next 7 days of bins still need. '}Tap an item to log what you found.</p>
    ${missing.length ? `<div class="banner"><span class="small">Rarity and location haven\u2019t been looked up yet for ${plural(missing.length, 'item')}.</span>
      ${S.updating ? '' : '<button class="btn primary small" data-act="update">Look up now</button>'}</div>` : ''}
    ${tasks.length ? body : `<div class="card"><h3 class="cardtitle" style="color:var(--green)">Nothing left to collect \u2713</h3><div class="small muted">${mode === 'all' ? (hasPools ? 'You already have enough to fill every request in the rotation.' : 'No rotation lists loaded yet.') : 'Every open bin already has its fish and artifacts covered by what\u2019s in your bag.'}</div></div>`}
    ${finds.length ? `<h2 class="section">Collected today</h2><div class="card">${finds.map((x) => {
      const [g, name] = splitKey(x.item_key);
      return `<div class="req-row"><span class="tiny muted" style="width:62px">${new Date(x.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>${icon(name, 26, g)}
        <span class="grow"><b>+${x.qty}</b> ${esc(name)}</span><button class="btn small" data-act="undo-find" data-id="${x.id}">Undo</button></div>`;
    }).join('')}</div>` : ''}`;
}

// ───────── Daily schedule & recipes ─────────
function viewSchedule() {
  const m = S.model, dates = m.dates(), today = todayISO();
  if (!['All', ...dates].includes(S.ui.schedDay)) S.ui.schedDay = 'All';
  const show = S.ui.schedDay === 'All' ? dates : [S.ui.schedDay];
  return `<div class="chips wrap" style="margin-bottom:8px">${['All', ...dates].map((d) => `<button class="chip ${S.ui.schedDay === d ? 'on' : ''}" data-act="sched-day" data-d="${d}">${d === 'All' ? 'All days' : shortDate(d) + (d === today ? ' (today)' : '')}</button>`).join('')}</div>
    <p class="note">Your bag is shared out day by day, earliest bins first \u2013 an item only counts as Ready for one bin.</p>
    ${show.map((d) => {
      const rows = m.schedule.filter((r) => r.date === d);
      const delivered = rows.filter((r) => m.binDone(d, r.bin)).length;
      return `<h2 class="section">${prettyDate(d)} <span class="muted small">\u2013 ${delivered}/${rows.length} delivered</span></h2><div class="inv-grid sm">${rows.map(requestTile).join('')}</div>`;
    }).join('')}`;
}
function viewRecipes() {
  const m = S.model;
  const it = (d) => m.item('Global Village', d);
  const by = {
    az: (a, b) => nameCmp(a, b), station: (a, b) => (m.station(it(a)) || 9) - (m.station(it(b)) || 9) || a.localeCompare(b),
    tocook: (a, b) => m.missing(it(b)) - m.missing(it(a)) || a.localeCompare(b), cancook: (a, b) => m.cookable(it(b)) - m.cookable(it(a)) || a.localeCompare(b),
    rarity: (a, b) => m.rarityRank(a) - m.rarityRank(b) || a.localeCompare(b),
  };
  const dishes = [...m.recipeMap.keys()].filter((d) => it(d) && !(S.ui.hideDone && m.missing(it(d)) === 0)).sort(by[S.ui.recSort] || by.az);
  return `<div class="sticky-tools"><div class="filters">${selectChip('rec-sort', 'Sort', [['az', S.ui.order === 'game' ? 'Game order' : 'A\u2013Z'], ['station', 'Cooking station'], ['tocook', 'Most to cook'], ['cancook', 'Can cook now'], ['rarity', 'Rarity']], S.ui.recSort, 'az')}
      <button class="chip ${S.ui.hideDone ? 'on' : ''}" data-act="hide-done">Hide finished dishes</button></div></div>
    <p class="note">Tap a dish to see its ingredients and cook it. <button class="linkish small" data-act="go" data-v="Cooking Ingredients">Cooking ingredients \u2192</button></p>
    <div class="inv-grid">${dishes.map((d) => {
      const it = m.item('Global Village', d), ms = m.missing(it), can = m.cookable(it);
      return tile({ k: key('Global Village', d), count: fmt(m.haveOf(it)), badge: ms ? `${ms} to cook` : '\u2713', badgeCls: ms ? 'orange' : 'green', dim: !ms, sub: `${m.station(it) ? `Lv ${m.station(it)}` : ''}${can ? ` \u00b7 can cook ${can}` : ''}` });
    }).join('') || '<div class="empty">No dishes requested right now.</div>'}</div>`;
}

// ───────── Clothing progress ─────────
function viewClothingProgress() {
  const m = S.model;
  if (!m.piecesFor.size) return `<div class="card empty-card"><b>Clothing hasn\u2019t been loaded yet</b><p class="small muted">Run More \u2192 Refresh item data to read every clothing item and how many pieces it needs.</p><button class="btn primary" data-act="refresh-items">Refresh item data now</button></div>`;
  const html = clothingProgressHTML(0);
  return html ? `<p class="note">Clothing you don\u2019t own yet, closest to done first. Tap one to add pieces \u2013 it completes automatically when you have them all.</p>${html}`
    : '<div class="card empty-card"><b>No clothing in progress</b><p class="small muted">Add pieces on the Items page (Fragments tab) and they\u2019ll show up here.</p></div>';
}

// ───────── Grab bins bookmark ─────────
const DASH_URL = location.origin + location.pathname;
let bookmarkCode = '';
async function buildBookmark() {
  if (bookmarkCode) return bookmarkCode;
  const src = await (await fetch('js/grab-bins.js', { cache: 'no-cache' })).text();
  const code = src.replace('__DASHBOARD_URL__', DASH_URL).split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('//')).join('\n');
  bookmarkCode = 'javascript:' + encodeURIComponent(code);
  return bookmarkCode;
}
function viewGrabBins() {
  setTimeout(async () => { const a = $('#bm-link'); if (a) a.href = await buildBookmark(); }, 0);
  return `<div class="card"><h3 class="cardtitle">Why a bookmark?</h3>
      <p class="small">The codex works out each bin\u2019s week in your browser. The page it sends is saved ahead of time and can be days old, and it blocks automated visitors from servers. So the reliable way to get the live 7 days is to read them where you see them: in your own browser, on loftiacodex.com.</p>
      <p class="small"><b>How it works:</b> open loftiacodex.com, tap the <b>Grab bins</b> bookmark, and it opens the nine bin pages in the background, reads each live week and rotation, then brings you back here to save them. It takes about half a minute.</p></div>
    <div class="card"><h3 class="cardtitle">On a computer</h3>
      <p class="small">Drag this button to your bookmarks bar (show the bar with Ctrl+Shift+B, or Cmd+Shift+B on a Mac):</p>
      <p><a id="bm-link" class="btn primary" href="#" onclick="event.preventDefault(); alert('Drag this button to your bookmarks bar, then click it while you\u2019re on loftiacodex.com.')">\u{1F4E5} Grab bins</a></p>
      <p class="small muted">Then open loftiacodex.com and click it.</p></div>
    <div class="card"><h3 class="cardtitle">On an iPhone or iPad (Safari)</h3>
      <ol class="small" style="padding-left:20px;margin:0">
        <li>Tap <b>Copy bookmark code</b> below.</li>
        <li>Bookmark any page: tap the Share button \u2192 <b>Add Bookmark</b>, name it <b>Grab bins</b>, and save.</li>
        <li>Open your bookmarks, tap <b>Edit</b>, tap the <b>Grab bins</b> bookmark, delete its address and paste the code in its place. Tap Done.</li>
        <li>Open loftiacodex.com, then open your bookmarks and tap <b>Grab bins</b>.</li></ol>
      <p style="margin-top:12px"><button class="btn primary" data-act="copy-bookmark">Copy bookmark code</button></p>
      <p class="tiny muted">Android Chrome works the same way: save a bookmark, edit its address, then on loftiacodex.com type \u201cGrab bins\u201d in the address bar and pick the bookmark.</p></div>`;
}
async function copyBookmark() {
  const code = await buildBookmark();
  try { await navigator.clipboard.writeText(code); toast('Bookmark code copied'); }
  catch {
    const ta = document.createElement('textarea'); ta.value = code; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Bookmark code copied'); } catch { await infoBox('Copy this code', code.slice(0, 200) + '\u2026'); }
    ta.remove();
  }
}
/** Bins sent back by the Grab bins bookmark (in the address after #grab=). */
function takeGrab() {
  let raw = null;
  if (location.hash.startsWith('#grab=')) {
    raw = location.hash.slice(6);
    try { sessionStorage.setItem('loftia-grab', raw); } catch { /* private mode */ }
    history.replaceState(null, '', location.pathname + location.search);
  } else {
    try { raw = sessionStorage.getItem('loftia-grab'); } catch { /* ignore */ }
  }
  if (!raw) return null;
  try { return JSON.parse(decodeURIComponent(raw)); } catch { try { sessionStorage.removeItem('loftia-grab'); } catch { /* ignore */ } return null; }
}
async function offerGrab() {
  const g = takeGrab();
  if (!g || !S.model) return;
  try { sessionStorage.removeItem('loftia-grab'); } catch { /* ignore */ }
  const ds = [...new Set((g.schedule || []).map((r) => r.date))].filter((d) => d >= todayISO()).sort();
  if (!ds.length) { await infoBox('Nothing new', 'The grabbed bins didn\u2019t include today or any days ahead.'); return; }
  const bins = new Set(g.schedule.map((r) => r.bin)).size;
  const ok = await confirmBox('Save the live bins?', `Grabbed from the codex in your browser:\n\n\u2022 ${bins} bins\n\u2022 ${rangeText(ds[0], ds[ds.length - 1])} (${ds.length} days)${g.failed?.length ? `\n\u2022 Couldn\u2019t read: ${g.failed.join(', ')} (their last saved requests are kept)` : ''}\n\nThis replaces the bin requests on your dashboard. Your items and completed bins aren\u2019t changed.`, 'Save');
  if (ok) runUpdate(g);
}

// ───────── More ─────────
function viewMore() {
  const m = S.model;
  const itemsAt = m.itemsData?.details_at || m.itemsData?.catalog_at;
  return `<h2 class="section" style="margin-top:0">Lists</h2>
    <div class="more-grid">${MORE_PAGES.map((p) => `<button class="card more-btn" data-act="go" data-v="${esc(p)}">${tileIcon(PAGE_ICONS[p], 44, GROUPS.includes(p) ? p : null)}<span><b>${esc(p)}</b><span class="tiny muted">${esc(SUBTITLES[p] || '')}</span></span></button>`).join('')}</div>
    <h2 class="section">Data</h2>
    <div class="card list-card">
      <button class="li" data-act="update" ${S.updating ? 'disabled' : ''}><b>\u21bb Update requests</b><span class="tiny muted">${esc(updatedText())}${S.model.data?.source ? ` \u00b7 from the ${esc(S.model.data.source)}` : ''}</span></button>
      <button class="li" data-act="refresh-items" ${S.refreshing ? 'disabled' : ''}><b>\u21bb Refresh item data</b><span class="tiny muted">Rarity, types, recipes, clothing and fragments from the codex. Reads only items it hasn\u2019t read yet. ${itemsAt ? `Last read ${new Date(itemsAt).toLocaleDateString()}` : 'Not loaded yet'}</span></button>
      <button class="li" data-act="refresh-all" ${S.refreshing ? 'disabled' : ''}><b>Re-read every item</b><span class="tiny muted">Use after a game update changes existing recipes. Takes several minutes.</span></button>
      <div class="li static"><b>Item pictures</b><span class="tiny muted">${localIconCount() ? `${fmt(localIconCount())} pictures saved on your site \u2013 they keep working even if the codex goes away.` : 'Loaded from loftiacodex.com. To keep your own copy, run \u201cSave item pictures\u201d in your GitHub repository\u2019s Actions tab (see README).'}</span></div>
      <button class="li" data-act="import"><b>Import CSV</b><span class="tiny muted">Update or replace your counts from a file</span></button>
      <button class="li" data-act="export"><b>Export CSV</b><span class="tiny muted">Download everything you own</span></button>
      <button class="li" data-act="backups"><b>Backups</b><span class="tiny muted">Restore, back up now, or use a backup file</span></button></div>
    <h2 class="section">Settings</h2>
    <div class="card list-card"><div class="li static"><b>Item order</b><span class="tiny muted">How items are ordered when sorting by name, everywhere.</span>
      <div class="seg small-seg" style="margin-top:8px" role="radiogroup">${[['az', 'A\u2013Z'], ['game', 'Game order (as on the codex)']].map(([v, l]) => `<button role="radio" aria-checked="${S.ui.order === v}" class="${S.ui.order === v ? 'on' : ''}" data-act="set-order" data-v="${v}">${l}</button>`).join('')}</div></div></div>
    <h2 class="section">Account</h2>
    <div class="card list-card"><div class="li static"><b>${esc(S.session.user.email || '')}</b><span class="tiny muted">Saved to your account</span></div>
      <button class="li" data-act="password"><b>Change password</b></button><button class="li" data-act="signout"><b>Sign out</b></button></div>
    <p class="tiny muted" style="text-align:center;margin-top:18px">Item pictures and game data from loftiacodex.com</p>`;
}

// ───────── actions ─────────
const ACT = {
  tab: (d) => { S.back = null; go(d.v); },
  go: (d) => { S.back = S.view; go(d.v); },
  back: () => go(S.back && S.back !== S.view ? S.back : 'More'),
  'open-bins': (d) => { if (d.d) S.ui.binDay = d.d; go('Bins'); },
  open: (d, el) => openSheet(d.key, el.dataset.ctx || null),
  'sheet-close': () => closeSheet(),
  'sheet-mode': (d) => { S.sheet.mode = d.v; renderSheet(); if (matchMedia('(pointer: fine)').matches) $('#sh-qty')?.focus(); },
  'sheet-save': () => sheetSave(),
  'sheet-delta': (d) => { const k = S.sheet.key; setCounts([{ item_key: k, have: S.model.get(k) + Number(d.d) }]); },
  'make-n': (d) => { S.sheet.makeN = Math.max(1, S.sheet.makeN + Number(d.d)); renderSheet(); },
  'rec-n': (d) => { S.sheet.recN = Math.max(1, S.sheet.recN + Number(d.d)); renderSheet(); },
  'sheet-make': (d) => {
    const name = nameOfKey(S.sheet.key), r = S.model.recipesFor(name)[Number(d.i)], n = S.sheet.makeN;
    const plan = S.model.makePlan(name, n, Number(d.i));
    if (plan) { S.sheet.makeN = 1; setCounts(plan, `${r.station === 'Cooking Station' ? 'Cooked' : 'Made'} ${n * (r.out || 1)} ${name} \u2013 ingredients taken out of your bag`); }
  },
  'sheet-recycle': () => {
    const name = nameOfKey(S.sheet.key), n = S.sheet.recN, plan = S.model.recyclePlan(name, n);
    if (plan) { S.sheet.recN = 1; setCounts(plan, `Recycled ${n} ${name}`); }
  },
  // Items page
  'items-tab': (d) => { S.ui.items.tab = d.v; S.ui.items.sub = 'All'; persist(); $$('[data-act="items-tab"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); fillItems(); },
  'cp-mode': (d) => { S.ui.cpMode = d.v; persist(); S.view === 'Items' ? fillItems() : refresh(); },
  'cp-all': () => { S.ui.items.tab = 'Clothing'; S.ui.items.search = ''; S.ui.cpAll = true; go(S.view === 'Clothing progress' ? 'Clothing progress' : 'Clothing progress'); },
  'items-owned': (d, el) => { S.ui.items.owned = !S.ui.items.owned; persist(); el.classList.toggle('on', S.ui.items.owned); fillItems(); },
  'items-sort': (d, el) => {
    const u = S.ui.items;
    if (d.v === 'rarity' && u.sort === 'rarity') u.dir = -u.dir; else if (d.v === 'rarity') u.dir = 1;
    u.sort = d.v; persist();
    $$('[data-act="items-sort"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v));
    if (d.v === 'rarity') el.textContent = u.dir < 0 ? 'Rarity \u2193' : 'Rarity \u2191';
    fillItems();
  },
  'items-clear': () => { S.ui.items.search = ''; $('#items-search').value = ''; fillItems(); $('#items-search').focus(); },
  // lists
  method: (d) => { S.ui.method = d.v; persist(); renderView(); },
  'list-sort': (d) => { S.ui.listSort = d.v; persist(); $$('[data-act="list-sort"]').forEach((b) => b.classList.toggle('on', b.dataset.v === d.v)); fillList(); },
  'rec-sort': (d) => { S.ui.recSort = d.v; persist(); renderView(); },
  missing: () => { S.ui.missingOnly = !S.ui.missingOnly; persist(); renderView(); },
  'list-clear': () => { S.ui.search = ''; $('#list-search').value = ''; fillList(); $('#list-search').focus(); },
  // bins, tasks, schedule, recipes
  'bin-day': (d) => { S.ui.binDay = d.d; persist(); renderView(); },
  'mark-bin': (d) => markBin(d.d, d.b),
  'undo-bin': (d) => undoBin(d.d, d.b),
  'mark-day': (d) => markDay(d.d),
  'task-filter': (d) => { S.ui.taskFilter = d.v; persist(); renderView(); },
  'task-mode': (d) => { S.ui.taskMode = d.v; persist(); renderView(); },
  'copy-bookmark': () => copyBookmark(),
  'set-order': (d) => { S.ui.order = d.v; persist(); S._db = null; refresh(); toast(d.v === 'game' ? 'Items now follow the game\u2019s order' : 'Items now sorted A\u2013Z'); },
  'undo-find': (d) => undoFind(Number(d.id)),
  'sched-day': (d) => { S.ui.schedDay = d.d; persist(); renderView(); },
  'hide-done': () => { S.ui.hideDone = !S.ui.hideDone; persist(); renderView(); },
  // data & account
  update: () => runUpdate(),
  'refresh-items': () => refreshItemData(false),
  'refresh-all': () => refreshItemData(true),
  import: () => { const f = $('#csv-file'); f.value = ''; f.click(); },
  export: () => exportCSV(),
  backups: () => backupsDialog(),
  password: () => changePasswordDialog(),
  signout: async () => { await db.signOut(); },
  send: () => sendLink(),
};

async function markBin(day, bin) {
  const m = S.model; m.recalc(todayISO());
  const plan = m.completePlan(day, bin);
  if (!plan) { await infoBox('Bin not complete', 'Every item for this bin needs to be in your bag before it can be marked done.'); return; }
  applyComplete(day, bin, plan); refresh();
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
  m.recalc(todayISO()); refresh();
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
  refresh();
  toast(`${plural(plans.length, 'bin')} done`);
  await safely(async () => { for (const [b, p] of plans) await db.completeBin(day, b, p); }, 'Some bins couldn\u2019t be marked done.');
}
async function logFind(k, n) {
  const m = S.model, name = nameOfKey(k);
  const proposed = new Map([[k, m.get(k) + n]]);
  const { changes: extra, messages } = m.completeClothing(proposed);
  m.have.set(k, m.get(k) + n);
  for (const c of extra) m.have.set(c.item_key, c.have);
  rebuild();
  const entry = { id: null, ts: new Date().toISOString(), item_key: k, qty: n };
  S.finds.unshift(entry);
  closeSheet(); refresh();
  toast([`+${n} ${name} added to your bag`, ...messages].join(' \u00b7 '));
  await safely(async () => {
    entry.id = await db.logFind(k, n);
    if (extra.length) await db.setInventory(extra.map((c) => ({ item_key: c.item_key, have: c.have })));
    refresh();
  }, 'The find couldn\u2019t be saved.');
}
async function undoFind(id) {
  const f = S.finds.find((x) => x.id === id);
  if (!f) return;
  S.model.have.set(f.item_key, Math.max(0, S.model.get(f.item_key) - f.qty)); rebuild();
  S.finds = S.finds.filter((x) => x !== f);
  refresh();
  toast('Find undone \u2013 taken back out of your bag', '\u21b6');
  await safely(() => db.undoFind(id), 'The find couldn\u2019t be undone.');
}

// ───────── Update requests & Refresh item data ─────────
async function runUpdate(live = null) {
  if (S.updating) return;
  S.updating = true; refresh();
  toast('Checking loftiacodex.com\u2026', '\u21bb');
  try {
    const before = JSON.stringify(S.model.schedule.map((r) => [r.date, r.bin, r.name, r.quantity]).sort());
    const data = await db.runUpdate(todayISO(), Object.keys(RECIPE_BOOK), live);
    const old = S.model;
    S.model = new Model(data, old.itemsData);
    S.model.have = old.have; S.model.completions = old.completions; S.model.done = old.done;
    S.model.recalc(todayISO());
    S._db = null; S.updateError = null; S.updating = false;
    refresh();
    const after = JSON.stringify(S.model.schedule.map((r) => [r.date, r.bin, r.name, r.quantity]).sort());
    const ds = S.model.dates();
    let msg = before === after ? 'Requests are already up to date' : `Requests updated \u2013 ${ds.length ? rangeText(ds[0], ds[ds.length - 1]) : 'no upcoming days'}`;
    msg += ` \u00b7 from the ${data.source || 'codex'}`;
    if (data.info_unknown) msg += ` \u00b7 location not found for ${plural(data.info_unknown, 'item')}`;
    if (S.model.missingRecipes.length) msg += ` \u00b7 no recipe found for ${S.model.missingRecipes.slice(0, 3).join(', ')}`;
    toast(msg);
    if (data.failed_bins?.length) {
      await infoBox('Some bins could not be updated', `These bin pages on loftiacodex.com couldn\u2019t be read:\n\n${data.failed_bins.map((b) => `\u2022 ${b}`).join('\n')}\n\nThey still show their requests from your last update. Everything else was updated. Try Update requests again later.`);
    }
  } catch (e) {
    S.updating = false; S.updateError = new Date(); $('.toast')?.remove(); refresh();
    await infoBox('Update failed', `${e.message}\n\nNothing was changed \u2013 your saved requests, inventory and completed bins are exactly as they were.`);
  }
}
async function refreshItemData(all = false) {
  if (S.refreshing) return;
  S.refreshing = true;
  const m = modal({ title: 'Refreshing item data', dismiss: false,
    body: '<p class="small" id="rf-msg">Reading the item list from loftiacodex.com\u2026</p><div class="bar"><i id="rf-bar" style="width:3%"></i></div><p class="tiny muted">The first time, this reads every item page once (about 800) and takes several minutes. After that it only reads new items. Keep this window open while it works.</p>',
    foot: '<button class="btn" data-x="stop">Stop</button>' });
  let stop = false;
  m.el.addEventListener('click', (e) => { if (e.target.closest('[data-x="stop"]')) { stop = true; $('#rf-msg', m.el).textContent = 'Stopping after this batch\u2026'; } });
  try {
    const cat = await db.itemCatalog();
    const known = S.model.itemsData?.details || {};
    const todo = (cat.todo || []).filter((slug) => all || !known[slug] || known[slug].v !== cat.version || !known[slug].rarity);
    let done = 0;
    const failedList = [];
    for (let i = 0; i < todo.length && !stop; i += 15) {
      const batch = todo.slice(i, i + 15);
      $('#rf-msg', m.el).textContent = `Reading item pages\u2026 ${done} of ${todo.length}`;
      const r = await db.itemDetails(batch);
      done += batch.length; failedList.push(...(r.failed || []));
      $('#rf-bar', m.el).style.width = `${Math.max(3, Math.round((100 * done) / todo.length))}%`;
    }
    let failed = failedList.length;
    if (failed && !stop) {   // try the pages that failed once more
      $('#rf-msg', m.el).textContent = `Trying ${failed} pages again\u2026`;
      const again = [];
      for (let i = 0; i < failedList.length; i += 10) again.push(...((await db.itemDetails(failedList.slice(i, i + 10))).failed || []));
      failed = again.length;
    }
    await reloadAll();
    m.close(); S.refreshing = false; render();
    const recipes = Object.values(S.model.itemsData.details || {}).filter((x) => x.craft).length;
    const rated = Object.values(S.model.itemsData.details || {}).filter((x) => x.rarity).length;
    toast(todo.length ? `Item data updated \u2013 ${fmt(cat.catalog)} items, ${fmt(rated)} with rarity, ${recipes} crafting recipes, ${S.model.piecesFor.size} clothing items made from pieces${failed ? ` (${failed} pages couldn\u2019t be read)` : ''}`
      : `Item list checked \u2013 no new items to read (${fmt(cat.catalog)} items)`);
  } catch (e) {
    m.close(); S.refreshing = false;
    await infoBox('Refresh failed', `${e.message}\n\nWhatever was read before the error has been kept. You can try again later.`);
    try { await reloadAll(); render(); } catch { /* keep what we have */ }
  }
}

// ───────── CSV export / import ─────────
function exportCSV() {
  const m = S.model;
  const rows = m.database().filter((r) => m.get(r.key) > 0).map((r) => [r.name, r.category, m.get(r.key)]);
  downloadText(toCSV([['Item', 'Category', 'Quantity'], ...rows]), `loftia_inventory_${todayISO()}.csv`, 'text/csv;charset=utf-8');
  toast(`Exported ${plural(rows.length, 'item')}`);
}
function downloadText(text, filename, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
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
    const { changes: extra, messages } = S.model.completeClothing(totals);
    for (const c of extra) totals.set(c.item_key, c.have);
    await db.setInventory([...totals].map(([item_key, have]) => ({ item_key, have })), mode === 'replace');
    await reloadAll(); render();
    toast(`Imported ${plural(totals.size, 'item')} \u2013 ${mode === 'replace' ? 'inventory replaced' : 'only these items updated'}. A backup was saved first.${messages.length ? ` ${messages.join(' \u00b7 ')}` : ''}`);
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
    for (const r of unclear) { const h = S.model.index.get(normName(r.name)); const n = h ? h[0] : r.name; fileQty.set(n, (fileQty.get(n) || 0) + r.qty); }
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
      const hits = (toks.length ? S.model.allNames.filter((n) => toks.every((t) => normName(n).includes(t))) : S.model.allNames).slice(0, 40);
      let html = hits.map((n) => `<button data-res="${i}" data-name="${esc(n)}">${icon(n, 22, groupOfCat(catOfName(n)))}<span>${esc(n)}</span>${fileQty.get(n) ? `<span class="tiny" style="margin-left:auto;color:var(--berry)">in file \u00d7${fileQty.get(n)}</span>` : ''}</button>`).join('');
      if (c.q.trim() && !S.model.index.has(normName(c.q))) html += `<button data-res="${i}" data-name="${esc(c.q.trim())}">Use \u201c${esc(c.q.trim())}\u201d as typed</button>`;
      return html || '<div class="tiny muted" style="padding:8px">No matches</div>';
    };
    const autoList = [...resolved].sort((a, b) => (CAT_ORDER.indexOf(a[1]) + 99) % 99 - (CAT_ORDER.indexOf(b[1]) + 99) % 99 || a[0].localeCompare(b[0]));
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
      for (const c of cards) { const n = label(c); if (n) final.push([n, (S.model.index.get(normName(n)) || ['', c.row.category])[1], c.row.qty]); }
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
    <form id="signin-form">
      <label class="small" for="email" style="display:block;margin-top:14px;font-weight:700">Email</label>
      <input id="email" type="email" required autocomplete="email" style="margin:4px 0 0">
      <label class="small" for="password" style="display:block;margin-top:12px;font-weight:700">Password</label>
      <input id="password" type="password" required autocomplete="current-password" style="margin:4px 0 14px">
      <button class="btn primary" style="width:100%" type="submit">Sign in</button></form>
    <p class="small" id="signin-msg" style="margin:10px 0 0;min-height:1.4em"></p>
    <p class="tiny muted" style="margin:14px 0 0">No password yet? Create your account in Supabase first \u2013 see README step 6.
      Or <button class="linkish tiny" data-act="send">email me a sign-in link instead</button>.</p></div></div>`;
}
function changePasswordDialog() {
  const m = modal({
    title: 'Change password',
    body: `<label class="small" style="font-weight:700" for="pw1">New password</label>
      <input id="pw1" class="search" style="width:100%;border-radius:12px;margin:4px 0 10px" type="password" autocomplete="new-password">
      <label class="small" style="font-weight:700" for="pw2">Type it again</label>
      <input id="pw2" class="search" style="width:100%;border-radius:12px;margin:4px 0 6px" type="password" autocomplete="new-password">
      <div class="tiny muted err">At least 6 characters.</div>`,
    foot: '<button class="btn" data-x="no">Cancel</button><button class="btn primary" data-x="yes">Save password</button>',
  });
  const save = async () => {
    const a = $('#pw1', m.el).value, b = $('#pw2', m.el).value, err = $('.err', m.el);
    const bad = (t) => { err.textContent = t; err.style.color = 'var(--berry)'; };
    if (a.length < 6) return bad('Use at least 6 characters.');
    if (a !== b) return bad('The two passwords don\u2019t match.');
    try { await db.changePassword(a); m.close(); toast('Password changed'); } catch (e) { bad(e.message); }
  };
  m.el.addEventListener('click', (e) => { const x = e.target.closest('[data-x]'); if (!x) return; x.dataset.x === 'yes' ? save() : m.close(); });
  m.el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  $('#pw1', m.el).focus();
}
async function signIn() {
  const email = $('#email').value.trim(), password = $('#password').value, msg = $('#signin-msg');
  if (!email || !password) { msg.textContent = 'Enter your email and password.'; msg.style.color = 'var(--berry)'; return; }
  const btn = $('#signin-form button[type="submit"]');
  btn.disabled = true; btn.textContent = 'Signing in\u2026'; msg.textContent = '';
  try { await db.signInWithPassword(email, password); }
  catch (e) { msg.textContent = e.message; msg.style.color = 'var(--berry)'; btn.disabled = false; btn.textContent = 'Sign in'; }
}
async function sendLink() {
  const email = $('#email').value.trim(), msg = $('#signin-msg');
  if (!email) { msg.textContent = 'Enter your email first, then click the link again.'; msg.style.color = 'var(--berry)'; $('#email').focus(); return; }
  msg.textContent = 'Sending\u2026'; msg.style.color = 'var(--muted)';
  try { await db.sendSignInLink(email); msg.textContent = `Check ${email} for a sign-in link (and your spam folder), then open it on this device.`; msg.style.color = 'var(--green)'; }
  catch (e) {
    msg.textContent = /rate limit/i.test(e.message) ? 'Supabase\u2019s free email service has hit its hourly limit. Sign in with your password instead, or try the link again in an hour.' : `Couldn\u2019t send the link: ${e.message}`;
    msg.style.color = 'var(--berry)';
  }
}
function setupScreen() {
  return `<div class="signin"><div class="card"><div class="logo" style="padding:0">Loftia</div>
    <h1 style="font:600 22px var(--display);margin:22px 0 6px">Almost there</h1>
    <p class="small">This site isn\u2019t connected to Supabase yet. Open <b>js/config.js</b> on GitHub and paste in your Supabase project URL and anon key \u2013 the README walks you through it.</p></div></div>`;
}


// ───────── global events ─────────
const CAT_ORDER = [...ADD_TABS, 'Flowers'];
document.addEventListener('click', (e) => {
  const el = e.target.closest('[data-act]');
  if (!el || el.closest('.overlay')) return;
  if (el.dataset.act === 'send') e.preventDefault();
  ACT[el.dataset.act]?.(el.dataset, el, e);
});
root.addEventListener('submit', (e) => { if (e.target.id === 'signin-form') { e.preventDefault(); signIn(); } });
const onListSearch = debounce(() => fillList(), 120);
const onItemsSearch = debounce(() => fillItems(), 120);
root.addEventListener('change', (e) => {
  const id = e.target.id, v = e.target.value;
  if (id === 'items-rarity') { S.ui.items.rarity = v; persist(); fillItems(); }
  if (id === 'items-sub') { S.ui.items.sub = v; persist(); fillItems(); }
  if (id === 'items-sort') { S.ui.items.sort = v; persist(); fillItems(); }
  if (id === 'list-method') { S.ui.method = v; persist(); renderView(); }
  if (id === 'list-sort') { S.ui.listSort = v; persist(); fillList(); e.target.closest('.chip').classList.toggle('on', v !== 'need'); }
  if (id === 'rec-sort') { S.ui.recSort = v; persist(); renderView(); }
});
root.addEventListener('input', (e) => {
  if (e.target.id === 'list-search') { S.ui.search = e.target.value; onListSearch(); }
  if (e.target.id === 'items-search') { S.ui.items.search = e.target.value; onItemsSearch(); }
});
document.addEventListener('keydown', (e) => {
  if (e.target.id === 'sh-qty' && e.key === 'Enter') { e.preventDefault(); sheetSave(); return; }
  if ((e.target.id === 'items-search' || e.target.id === 'list-search') && e.key === 'Escape') { e.target.value = ''; e.target.dispatchEvent(new Event('input', { bubbles: true })); return; }
  if (document.querySelector('.overlay')) return;
  if (e.key === 'Escape' && S.sheet) { e.preventDefault(); closeSheet(); return; }
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
    const s = $('#items-search') || $('#list-search');
    if (s) { e.preventDefault(); s.focus(); s.select(); }
  }
});

// ───────── start ─────────
async function start() {
  if (location.hash.startsWith('#grab=')) takeGrab();   // keep grabbed bins safe until you're signed in
  if (!db.configured) { render(); return; }
  S.session = await db.session();
  db.onAuth(async (s) => {
    const was = !!S.session;
    S.session = s;
    if (s && !was) { S.model = null; render(); await loadOrFail(); }
    if (!s) { S.model = null; closeSheet(); render(); }
  });
  render();
  if (S.session) await loadOrFail();
}
async function loadOrFail() {
  try { await reloadAll(); render(); offerGrab(); } catch (e) {
    root.innerHTML = `<div class="signin"><div class="card"><h1 style="font:600 22px var(--display)">Couldn\u2019t load your data</h1>
      <p class="small">${esc(e.message)}</p><p class="small muted">If this is a new setup, check that you ran <b>supabase/schema.sql</b> in the Supabase SQL Editor.</p>
      <button class="btn primary" onclick="location.reload()">Try again</button></div></div>`;
  }
}
start();
