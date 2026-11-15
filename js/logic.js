// All of the dashboard's rules, with no screen code - so they can be tested on their own.
import {
  RECIPE_BOOK, STATION_LEVEL, CATALOG, BIN_PAGES, INGREDIENT_METHODS, METHOD_BY_GROUP,
} from './gamedata.js';

export const GROUPS = ['Floating Village', 'Global Village', 'Museum', 'Cooking Ingredients'];
export const TASK_GROUPS = ['Floating Village', 'Museum'];
export const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very rare', 'Epic', 'Legendary']; // easiest -> hardest
export const CATEGORIES = Object.keys(CATALOG);
export const CATEGORY_GROUP = {
  Materials: 'Cooking Ingredients', Crops: 'Cooking Ingredients', Flowers: 'Cooking Ingredients',
  Foods: 'Global Village', Fishes: 'Floating Village', Artifacts: 'Museum', Other: 'Cooking Ingredients',
};
export const GROUP_CATEGORY = { 'Floating Village': 'Fishes', Museum: 'Artifacts', 'Global Village': 'Foods' };
const BIN_ORDER = Object.fromEntries(BIN_PAGES.map((b, i) => [b[2], i]));

export const key = (group, name) => `${group}||${name}`;
export const splitKey = (k) => { const i = k.indexOf('||'); return [k.slice(0, i), k.slice(i + 2)]; };
export const binId = (day, bin) => `${day}|${bin}`;

export function slugify(name) {
  return name.toLowerCase().replace(/['\u2019]/g, '').replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
export function normName(name) {
  return String(name).toLowerCase().replace(/\u2019/g, "'").replace(/'/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
}
export const iconUrl = (name) => `https://loftiacodex.com/icons/${slugify(name)}.webp`;
export const itemUrl = (name) => `https://loftiacodex.com/items/${slugify(name)}/`;

export const CATALOG_INDEX = new Map(); // norm name -> [name, category]
for (const [cat, names] of Object.entries(CATALOG)) {
  for (const n of names) if (!CATALOG_INDEX.has(normName(n))) CATALOG_INDEX.set(normName(n), [n, cat]);
}
export const ALL_CATALOG_NAMES = [...CATALOG_INDEX.values()].map((v) => v[0]).sort((a, b) => a.localeCompare(b));

export function todayISO(d = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
export function parseISO(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(s, n) { const d = parseISO(s); d.setDate(d.getDate() + n); return todayISO(d); }
export function daysBetween(a, b) { return Math.round((parseISO(b) - parseISO(a)) / 86400000); }
const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export function shortDate(s) { const d = parseISO(s); return `${WD[d.getDay()]} ${MON[d.getMonth()]} ${d.getDate()}`; }
export function prettyDate(s) { const d = parseISO(s); return `${WDL[d.getDay()]}, ${MON[d.getMonth()]} ${d.getDate()}`; }
export function rangeText(a, b) {
  const da = parseISO(a), db = parseISO(b);
  return da.getMonth() === db.getMonth()
    ? `${MON[da.getMonth()]} ${da.getDate()}\u2013${db.getDate()}`
    : `${MON[da.getMonth()]} ${da.getDate()} \u2013 ${MON[db.getMonth()]} ${db.getDate()}`;
}

/** The working model: item list built from the bin requests, plus your counts. */
export class Model {
  constructor(data) {
    this.data = data || { schedule: [] };
    this.schedule = (this.data.schedule || []).slice();
    this.info = this.data.item_info || {};
    this.have = new Map();
    this.done = new Set();
    this.today = todayISO();
    this._build();
    this.recalc();
  }

  _build() {
    const need = new Map();
    for (const r of this.schedule) {
      const k = key(r.group, r.name);
      need.set(k, (need.get(k) || 0) + r.quantity);
    }
    const items = [];
    for (const [k, q] of need) {
      const [g, n] = splitKey(k);
      items.push({ group: g, name: n, need: q, method: METHOD_BY_GROUP[g] || 'Collect' });
    }
    const dishes = [...new Set(this.schedule.filter((r) => r.group === 'Global Village').map((r) => r.name))].sort();
    const extra = this.data.extra_recipes || {};
    this.recipes = [];
    this.missingRecipes = [];
    for (const d of dishes) {
      const book = RECIPE_BOOK[d] ? RECIPE_BOOK[d].map(([ingredient, per]) => ({ ingredient, per }))
        : (extra[d] || []).map((x) => ({ ingredient: x.ingredient, per: x.per_dish || x.per || 1 }));
      if (!book.length) this.missingRecipes.push(d);
      for (const x of book) this.recipes.push({ dish: d, ingredient: x.ingredient, per: x.per });
    }
    const have = new Set(items.map((i) => key(i.group, i.name)));
    for (const ing of [...new Set(this.recipes.map((r) => r.ingredient))].sort()) {
      const k = key('Cooking Ingredients', ing);
      if (!have.has(k)) {
        have.add(k);
        items.push({ group: 'Cooking Ingredients', name: ing, need: 0, method: INGREDIENT_METHODS[ing] || 'Gather' });
      }
    }
    items.sort((a, b) => a.group.localeCompare(b.group) || a.name.localeCompare(b.name));
    this.items = items;
    this.byKey = new Map(items.map((i) => [key(i.group, i.name), i]));
    this.itemByNorm = new Map(items.map((i) => [normName(i.name), key(i.group, i.name)]));
    this.recipeMap = new Map();
    for (const r of this.recipes) {
      if (!this.recipeMap.has(r.dish)) this.recipeMap.set(r.dish, []);
      this.recipeMap.get(r.dish).push(r);
    }
  }

  setState({ inventory = [], completions = [] } = {}) {
    this.have = new Map(inventory.map((r) => [r.item_key, r.have]));
    this.completions = completions;
    this.done = new Set(completions.map((c) => binId(c.day, c.bin)));
    this.recalc();
  }

  get(k) { return this.have.get(k) || 0; }
  haveOf(item) { return item ? this.get(key(item.group, item.name)) : 0; }
  item(group, name) { return this.byKey.get(key(group, name)); }

  // ── what's still needed ──
  recalc(today = todayISO()) {
    this.today = today;
    this.openNeed = new Map();
    for (const r of this.schedule) {
      if (r.date >= today && !this.done.has(binId(r.date, r.bin))) {
        const k = key(r.group, r.name);
        this.openNeed.set(k, (this.openNeed.get(k) || 0) + r.quantity);
      }
    }
    const ing = new Map();
    for (const [dish, list] of this.recipeMap) {
      const cooked = this.item('Global Village', dish);
      if (!cooked) continue;
      const missing = Math.max(0, this.required(cooked) - this.haveOf(cooked));
      for (const r of list) ing.set(r.ingredient, (ing.get(r.ingredient) || 0) + missing * r.per);
    }
    this.ingredientNeed = ing;
    this._allocate();
  }

  required(item) {
    if (item.group === 'Cooking Ingredients') return this.ingredientNeed.get(item.name) || 0;
    return this.openNeed.get(key(item.group, item.name)) || 0;
  }
  missing(item) { return Math.max(0, this.required(item) - this.haveOf(item)); }

  rows(category) {
    if (category === 'Shopping List') return this.items.filter((i) => this.missing(i) > 0);
    if (category === 'All Items') return this.items;
    return this.items.filter((i) => i.group === category);
  }

  station(item) { return item && item.group === 'Global Village' ? STATION_LEVEL[item.name] || null : null; }

  cookable(dish) {
    if (!dish || dish.group !== 'Global Village') return 0;
    const recipe = this.recipeMap.get(dish.name);
    if (!recipe) return 0;
    return Math.min(...recipe.map((r) => Math.floor(this.get(key('Cooking Ingredients', r.ingredient)) / Math.max(1, r.per))));
  }
  /** Inventory changes for cooking n of a dish: [{item_key, have}] */
  cookPlan(dish, n) {
    n = Math.min(n, this.cookable(dish));
    if (n <= 0) return null;
    const out = this.recipeMap.get(dish.name).map((r) => {
      const k = key('Cooking Ingredients', r.ingredient);
      return { item_key: k, have: this.get(k) - r.per * n };
    });
    out.push({ item_key: key(dish.group, dish.name), have: this.haveOf(dish) + n });
    return out;
  }
  usesOf(ingredient) { return this.recipes.filter((r) => r.ingredient === ingredient); }
  requestsFor(item) { return this.schedule.filter((r) => r.group === item.group && r.name === item.name); }

  // ── item info from the codex (rarity / where to find it) ──
  itemInfo(name) { return this.info[slugify(name)] || {}; }
  rarityRank(name) { const r = this.itemInfo(name).rarity; const i = RARITIES.indexOf(r); return i < 0 ? RARITIES.length : i; }
  missingInfo() {
    return this.items.filter((i) => TASK_GROUPS.includes(i.group)
      && !(this.itemInfo(i.name).rarity && (this.itemInfo(i.name).location || this.itemInfo(i.name).district)));
  }

  // ── contribution bins ──
  dates() { return [...new Set(this.schedule.map((r) => r.date))].sort(); }
  binEntries(day, bin) {
    const merged = new Map();
    for (const r of this.schedule) {
      if (r.date === day && r.bin === bin) {
        const k = key(r.group, r.name);
        merged.set(k, (merged.get(k) || 0) + r.quantity);
      }
    }
    return [...merged].map(([k, qty]) => { const [group, name] = splitKey(k); return { item: this.byKey.get(k), group, name, qty, key: k }; });
  }
  binDone(day, bin) { return this.done.has(binId(day, bin)); }
  isExpired(day) { return day < this.today; }
  openBins(day) {
    const bins = [...new Set(this.schedule.filter((r) => r.date === day).map((r) => r.bin))];
    return bins.filter((b) => !this.binDone(day, b)).sort((a, b) => (BIN_ORDER[a] ?? 99) - (BIN_ORDER[b] ?? 99));
  }
  removedFor(day, bin) {
    const out = {};
    for (const c of this.completions || []) if (c.day === day && c.bin === bin) out[c.item_key] = c.removed;
    return out;
  }
  /** Share your bag between open bins, earliest first: alloc[binId] = Map(item_key -> [covered, wanted]) */
  _allocate() {
    const remaining = new Map(this.have);
    this.alloc = new Map();
    const bins = [...new Set(this.schedule
      .filter((r) => r.date >= this.today && !this.done.has(binId(r.date, r.bin)))
      .map((r) => binId(r.date, r.bin)))]
      .sort((a, b) => {
        const [da, ba] = a.split('|'), [dbb, bb] = b.split('|');
        return da.localeCompare(dbb) || (BIN_ORDER[ba] ?? 99) - (BIN_ORDER[bb] ?? 99);
      });
    for (const id of bins) {
      const [d, b] = id.split('|');
      const slot = new Map();
      for (const e of this.binEntries(d, b)) {
        const c = Math.min(remaining.get(e.key) || 0, e.qty);
        remaining.set(e.key, (remaining.get(e.key) || 0) - c);
        slot.set(e.key, [c, e.qty]);
      }
      this.alloc.set(id, slot);
    }
  }
  binCover(day, bin, k) { const s = this.alloc.get(binId(day, bin)); return (s && s.get(k)) || [0, 0]; }
  binReady(day, bin) {
    const s = this.alloc.get(binId(day, bin));
    return !!s && s.size > 0 && [...s.values()].every(([c, q]) => c >= q);
  }
  binShort(day, bin) {
    const s = this.alloc.get(binId(day, bin));
    return s ? [...s.values()].reduce((t, [c, q]) => t + (q - c), 0) : 0;
  }
  /** What marking a bin done would do: [{item_key, removed, requested, have}] or null if not ready */
  completePlan(day, bin) {
    if (this.binDone(day, bin) || !this.binReady(day, bin)) return null;
    return this.binEntries(day, bin).map((e) => ({
      item_key: e.key, removed: e.qty, requested: e.qty, have: this.get(e.key) - e.qty,
    }));
  }

  // ── task list ──
  buildTasks(groups = TASK_GROUPS) {
    const per = new Map();
    for (const [id, slot] of this.alloc) {
      const [d, b] = id.split('|');
      for (const [k, [c, q]] of slot) {
        const [g, n] = splitKey(k);
        if (!groups.includes(g) || c >= q) continue;
        if (!per.has(k)) per.set(k, { key: k, group: g, name: n, short: 0, due: d, bins: [] });
        const e = per.get(k);
        e.short += q - c;
        if (d < e.due) e.due = d;
        e.bins.push([d, b, q - c]);
      }
    }
    const stops = new Map();
    for (const e of per.values()) {
      const info = this.itemInfo(e.name);
      e.rarity = info.rarity || '';
      e.rank = this.rarityRank(e.name);
      e.item = this.byKey.get(e.key);
      const sk = `${info.district || ''}||${info.location || ''}`;
      if (!stops.has(sk)) stops.set(sk, { district: info.district || '', location: info.location || '', items: [] });
      stops.get(sk).items.push(e);
    }
    const tasks = [];
    for (const t of stops.values()) {
      t.deadline = t.items.reduce((m, e) => (e.due < m ? e.due : m), t.items[0].due);
      for (const e of t.items) e.bonus = e.due > t.deadline;
      t.items.sort((a, b) => (a.bonus - b.bonus) || a.due.localeCompare(b.due) || (a.rank - b.rank) || a.name.localeCompare(b.name));
      const main = t.items.filter((e) => !e.bonus);
      t.known = !!(t.location || t.district);
      t.rank = Math.max(...main.map((e) => e.rank));
      t.main = main.length;
      t.total = t.items.length;
      tasks.push(t);
    }
    tasks.sort((a, b) => a.deadline.localeCompare(b.deadline) || (a.known === b.known ? 0 : a.known ? -1 : 1)
      || (a.rank - b.rank) || (b.main - a.main) || (b.total - a.total)
      || a.district.localeCompare(b.district) || a.location.localeCompare(b.location));
    return tasks;
  }

  // ── item database (My Items) and CSV import ──
  keyForName(name, category = '') {
    const hit = CATALOG_INDEX.get(normName(name));
    if (hit) [name, category] = hit;
    const k = this.itemByNorm.get(normName(name));
    if (k) return k;
    if (GROUPS.includes(category)) return key(category, name);
    const cat = category ? category.trim().replace(/^\w/, (c) => c.toUpperCase()) : 'Other';
    const alias = { Fish: 'Fishes', Food: 'Foods', Artifact: 'Artifacts', Material: 'Materials', Crop: 'Crops' };
    return key(CATEGORY_GROUP[alias[cat] || cat] || 'Cooking Ingredients', name);
  }

  database() {
    const rows = [], seen = new Set();
    for (const cat of CATEGORIES) {
      for (const name of CATALOG[cat]) {
        const k = this.keyForName(name, cat);
        if (seen.has(k)) continue;
        seen.add(k);
        rows.push({ key: k, name, category: cat, search: normName(`${name} ${cat}`) });
      }
    }
    const extra = new Set([...this.have.keys(), ...this.byKey.keys()]);
    for (const k of extra) {
      if (seen.has(k)) continue;
      if (!this.byKey.has(k) && this.get(k) <= 0) continue;
      seen.add(k);
      const [g, name] = splitKey(k);
      const cat = GROUP_CATEGORY[g] || 'Other';
      rows.push({ key: k, name, category: cat, search: normName(`${name} ${cat}`) });
    }
    return rows;
  }

  /** Split CSV rows into sure matches [[name, category, qty]] and unclear ones that need a pick. */
  resolveImport(rows) {
    const tracked = new Map(this.items.map((i) => [normName(i.name), i.name]));
    const resolved = [], unclear = [];
    const catalogKeys = [...CATALOG_INDEX.keys()];
    for (const r of rows) {
      const n = normName(r.name);
      const hit = CATALOG_INDEX.get(n);
      const exact = hit ? hit[0] : tracked.get(n);
      if (exact && !r.confirm) { resolved.push([exact, r.category || (hit ? hit[1] : ''), r.qty]); continue; }
      const cands = exact ? [exact] : [];
      for (const a of r.alternatives || []) {
        const h = CATALOG_INDEX.get(normName(a));
        if (h && !cands.includes(h[0])) cands.push(h[0]);
      }
      if (cands.length < 4) {
        for (const m of closeMatches(n, catalogKeys, 4, 0.6)) {
          const nm = CATALOG_INDEX.get(m)[0];
          if (!cands.includes(nm)) cands.push(nm);
        }
      }
      unclear.push({ ...r, candidates: cands.slice(0, 4), exact: !!exact });
    }
    return { resolved, unclear };
  }

  /** [[name, category, qty]] -> Map(item_key -> qty) (rows naming the same item are added together) */
  importTotals(rows) {
    const totals = new Map();
    for (const [name, cat, qty] of rows) {
      const k = this.keyForName(name, cat);
      totals.set(k, (totals.get(k) || 0) + qty);
    }
    return totals;
  }
}

// ── CSV ──
export function parseCSV(text) {
  const rows = [];
  let row = [], field = '', q = false;
  text = text.replace(/^\uFEFF/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; } else field += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); field = '';
      if (row.some((c) => c.trim() !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  row.push(field);
  if (row.some((c) => c.trim() !== '')) rows.push(row);
  return rows;
}

/** CSV text -> [{name, category, qty, confirm, alternatives, row}] (accepts our own export too) */
export function readInventoryCSV(text) {
  const table = parseCSV(text);
  if (!table.length) throw new Error('The file is empty.');
  const head = table[0].map((h) => h.trim().toLowerCase());
  const col = (...names) => { for (const n of names) { const i = head.indexOf(n); if (i >= 0) return i; } return -1; };
  const ni = col('item', 'name', 'item name'), qi = col('quantity', 'qty', 'have', 'count', 'amount');
  const ci = col('category', 'group', 'type'), fi = col('confirm', 'check', 'needs check', 'unsure');
  const ai = col('alternatives', 'alternative', 'could be', 'maybe');
  if (ni < 0 || qi < 0) throw new Error('The CSV needs an "Item" column and a "Quantity" column.');
  const rows = [], bad = [];
  table.slice(1).forEach((cells, idx) => {
    const name = (cells[ni] || '').trim();
    if (!name) return;
    const raw = (cells[qi] || '0').trim() || '0';
    const qty = Math.trunc(Number(raw.replace(/,/g, '')));
    if (!Number.isFinite(qty) || qty < 0) { bad.push(`row ${idx + 2} (${name})`); return; }
    rows.push({
      name, qty, row: idx + 2,
      category: ci >= 0 ? (cells[ci] || '').trim() : '',
      confirm: fi >= 0 && ['yes', 'y', 'true', '1', 'x', 'check'].includes((cells[fi] || '').trim().toLowerCase()),
      alternatives: ai >= 0 ? (cells[ai] || '').split(/[;|/]/).map((s) => s.trim()).filter(Boolean) : [],
    });
  });
  if (bad.length) throw new Error(`These rows have a quantity that isn\u2019t a whole number: ${bad.slice(0, 5).join(', ')}`);
  if (!rows.length) throw new Error('No items were found in the file.');
  return rows;
}

export function toCSV(rows) {
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return rows.map((r) => r.map(esc).join(',')).join('\r\n') + '\r\n';
}

// Similarity like Python's difflib ratio (good enough for typo matching).
function ratio(a, b) {
  if (!a.length && !b.length) return 1;
  const m = matchCount(a, b);
  return (2 * m) / (a.length + b.length);
}
function matchCount(a, b) {
  if (!a.length || !b.length) return 0;
  let best = 0, ai = 0, bi = 0;
  const prev = new Array(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    let diag = 0;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = a[i - 1] === b[j - 1] ? diag + 1 : 0;
      if (prev[j] > best) { best = prev[j]; ai = i - best; bi = j - best; }
      diag = tmp;
    }
  }
  if (!best) return 0;
  return best + matchCount(a.slice(0, ai), b.slice(0, bi)) + matchCount(a.slice(ai + best), b.slice(bi + best));
}
export function closeMatches(word, choices, n = 4, cutoff = 0.6) {
  return choices.map((c) => [ratio(word, c), c]).filter(([r]) => r >= cutoff)
    .sort((x, y) => y[0] - x[0]).slice(0, n).map(([, c]) => c);
}
