// Supabase Edge Function: "update-requests"
// Reads the nine contribution-bin pages on loftiacodex.com, looks up recipes for new dishes and
// rarity/location for fish & artifacts, then saves the result for the website to use.
// The website calls this only when you press "Update requests".
import { createClient } from 'jsr:@supabase/supabase-js@2';

const BIN_PAGES = [
  ['floating-village-bin-lv1', 'Floating Village', 'Floating Village Lv.1'],
  ['floating-village-bin-lv2', 'Floating Village', 'Floating Village Lv.2'],
  ['floating-village-bin-lv3', 'Floating Village', 'Floating Village Lv.3'],
  ['global-village-bin-lv1', 'Global Village', 'Global Village Lv.1'],
  ['global-village-bin-lv2', 'Global Village', 'Global Village Lv.2'],
  ['global-village-bin-lv3', 'Global Village', 'Global Village Lv.3'],
  ['museum-bin-lv1', 'Museum', 'Museum Lv.1'],
  ['museum-bin-lv2', 'Museum', 'Museum Lv.2'],
  ['museum-bin-lv3', 'Museum', 'Museum Lv.3'],
];
const TASK_GROUPS = ['Floating Village', 'Museum'];
const RARITIES = ['Common', 'Uncommon', 'Rare', 'Very rare', 'Very Rare', 'Epic', 'Legendary'];
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) LoftiaInventoryDashboard/3.0 (web)';

// ───────── tiny forgiving HTML reader ─────────
const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', times: '\u00d7', rsquo: '\u2019', lsquo: '\u2018', ldquo: '\u201c', rdquo: '\u201d', middot: '\u00b7', ndash: '\u2013', mdash: '\u2014', hellip: '\u2026' };
function decode(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] === '#') return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
    return ENT[e.toLowerCase()] ?? m;
  });
}
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
type Node = { tag: string; attrs: Record<string, string>; children: (Node | string)[]; parent: Node | null };
export function parseHTML(html: string): Node {
  html = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1\s*>/gi, '');
  const root: Node = { tag: 'root', attrs: {}, children: [], parent: null };
  let cur = root;
  const re = /<(\/?)([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>|([^<]+)|</g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined || m[0] === '<') { cur.children.push(decode(m[4] ?? '<')); continue; }
    const tag = m[2].toLowerCase();
    if (m[1]) { // closing tag
      let n: Node | null = cur;
      while (n && n !== root && n.tag !== tag) n = n.parent;
      if (n && n !== root) cur = n.parent as Node;
      continue;
    }
    const attrs: Record<string, string> = {};
    const ar = /([^\s=\/"']+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
    let a: RegExpExecArray | null;
    while ((a = ar.exec(m[3]))) attrs[a[1].toLowerCase()] = decode(a[2] ?? a[3] ?? a[4] ?? '');
    const node: Node = { tag, attrs, children: [], parent: cur };
    cur.children.push(node);
    if (!VOID.has(tag) && !/\/\s*$/.test(m[3])) cur = node;
  }
  return root;
}
function* walk(n: Node): Generator<Node> {
  for (const c of n.children) if (typeof c !== 'string') { yield c; yield* walk(c); }
}
function text(n: Node, skip: string[] = []): string {
  return n.children.map((c) => (typeof c === 'string' ? c : skip.includes(c.tag) ? '' : text(c, skip))).join('');
}
const squash = (s: string) => s.replace(/\s+/g, ' ').trim();
const HEADINGS = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];
function listAfterHeading(root: Node, heading: string): Node | null {
  const nodes = [...walk(root)];
  const want = heading.toLowerCase();
  for (let i = 0; i < nodes.length; i++) {
    if (HEADINGS.includes(nodes[i].tag) && squash(text(nodes[i])).toLowerCase().startsWith(want)) {
      for (const m of nodes.slice(i + 1)) {
        if (HEADINGS.includes(m.tag)) return null;
        if (m.tag === 'ol' || m.tag === 'ul') return m;
      }
    }
  }
  return null;
}

// ───────── dates ─────────
const iso = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
function resolveDayLabel(label: string, today: string): string | null {
  const m = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+(\d{1,2})\b/.exec(label);
  if (!m) return null;
  const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(m[1]);
  const day = Number(m[2]);
  let best: string | null = null, bestDist = 99;
  for (let k = -14; k <= 14; k++) {
    const s = addDays(today, k);
    const d = new Date(s + 'T00:00:00Z');
    if (d.getUTCDay() === wd && d.getUTCDate() === day && Math.abs(k) < bestDist) { best = s; bestDist = Math.abs(k); }
  }
  return best;
}

// ───────── page readers ─────────
export function parseBinPage(html: string, today: string): [string, [number, string][]][] {
  const list = listAfterHeading(parseHTML(html), 'Next seven days');
  if (!list) throw new Error('"Next seven days" list not found');
  const rows: [string, [number, string][]][] = [];
  for (const li of list.children) {
    if (typeof li === 'string' || li.tag !== 'li') continue;
    const label = squash(text(li, ['a']));
    const items: [number, string][] = [];
    for (const a of walk(li)) {
      if (a.tag !== 'a') continue;
      const t = /^\s*(\d+)\s*[x\u00d7]?\s+(.+?)\s*$/.exec(a.attrs.title || '');
      if (t) { items.push([Number(t[1]), t[2]]); continue; }
      const img = [...walk(a)].find((n) => n.tag === 'img' && n.attrs.alt);
      if (img) { const q = /\d+/.exec(text(a)); items.push([q ? Number(q[0]) : 1, img.attrs.alt.trim()]); }
    }
    rows.push([label, items]);
  }
  if (!rows.length) throw new Error('no days listed');
  let base: string | null = null;
  rows.some(([label], k) => { const d = resolveDayLabel(label, today); if (d) { base = addDays(d, -k); return true; } return false; });
  const b = base ?? today;
  return rows.map(([label, items], k) => {
    const low = label.toLowerCase();
    const d = low.includes('today') ? b : low.includes('tomorrow') ? addDays(b, 1) : (resolveDayLabel(label, today) ?? addDays(b, k));
    return [d, items];
  });
}

export function parseRecipe(html: string): { ingredient: string; per_dish: number }[] {
  const list = listAfterHeading(parseHTML(html), 'Craft');
  if (!list) return [];
  const out: { ingredient: string; per_dish: number }[] = [];
  for (const li of walk(list)) {
    if (li.tag !== 'li') continue;
    const t = squash(text(li));
    const q = /[x\u00d7\u2715]\s*(\d+)/.exec(t);
    const a = [...walk(li)].find((n) => n.tag === 'a' && n.attrs.title);
    const name = a ? a.attrs.title.trim() : t.split(/\s*[x\u00d7\u2715]\s*\d/)[0].trim();
    if (name) out.push({ ingredient: name, per_dish: q ? Number(q[1]) : 1 });
  }
  return out;
}

const INFO_LABELS: Record<string, string> = {
  district: 'district', 'found in': 'location', location: 'location', 'found at': 'location',
  research: 'research', type: 'type', time: 'time', weather: 'weather', season: 'season',
};
export function parseItemInfo(html: string): Record<string, string> {
  const root = parseHTML(html);
  const segs: string[] = [];
  let start: number | null = null;
  const visit = (n: Node) => {
    for (const c of n.children) {
      if (typeof c === 'string') { const t = squash(c); if (t) segs.push(t); }
      else { if (c.tag === 'h1' && start === null) start = segs.length; visit(c); }
    }
  };
  visit(root);
  const body = start !== null ? segs.slice(start) : segs;
  const info: Record<string, string> = {};
  body.forEach((seg, i) => {
    const low = seg.toLowerCase().replace(/:$/, '');
    const field = INFO_LABELS[low];
    if (field && !info[field] && i + 1 < body.length) { info[field] = body[i + 1]; return; }
    for (const [label, f] of Object.entries(INFO_LABELS)) {
      if (!info[f] && low.startsWith(label + ' ') && seg.length > label.length + 1) info[f] = seg.slice(label.length + 1).trim();
    }
    if (!info.rarity && RARITIES.includes(seg)) info.rarity = seg === 'Very Rare' ? 'Very rare' : seg;
  });
  for (const f of Object.keys(info)) {
    const v = info[f].toLowerCase().replace(/:$/, '');
    if (INFO_LABELS[v] || (f !== 'rarity' && RARITIES.includes(info[f]))) delete info[f];
  }
  return info;
}

export function slugify(name: string) {
  return name.toLowerCase().replace(/['\u2019]/g, '').replace(/&/g, ' ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

class HttpError extends Error { status: number; constructor(status: number) { super(`HTTP ${status}`); this.status = status; } }
async function fetchHTML(url: string): Promise<string> {
  const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,*/*;q=0.8' }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new HttpError(res.status);
  return await res.text();
}
function explainFailure(errors: unknown[]): string {
  const http = errors.find((e) => e instanceof HttpError) as HttpError | undefined;
  if (http) return `loftiacodex.com answered with an error (code ${http.status}). The site may be down for a moment \u2013 try again in a few minutes.`;
  if (errors.some((e) => e instanceof TypeError || (e instanceof Error && /timed? ?out|abort|network|connect|dns/i.test(e.message + e.name))))
    return 'Couldn\u2019t reach loftiacodex.com from the server. Try again in a few minutes.';
  return 'loftiacodex.com was reached, but the bin pages could not be read. The site layout may have changed.';
}
async function pool<T>(items: T[], size: number, fn: (x: T) => Promise<void>) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => { while (i < items.length) await fn(items[i++]); }));
}

// ───────── the function ─────────
const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const reply = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

if (typeof Deno !== 'undefined' && Deno.serve) Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  try {
    const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
    const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '');
    const { data: who } = await admin.auth.getUser(token);
    if (!who?.user) return reply({ error: 'Please sign in first.' }, 401);

    const body = await req.json().catch(() => ({}));
    const today: string = /^\d{4}-\d{2}-\d{2}$/.test(body.today || '') ? body.today : iso(new Date());
    const knownDishes = new Set<string>(body.known_dishes || []);
    const { data: prevRow } = await admin.from('app_data').select('data').eq('id', 'requests').maybeSingle();
    const prev = prevRow?.data || { schedule: [], extra_recipes: {}, item_info: {} };

    // 1. bin pages
    const schedule: Record<string, unknown>[] = [];
    const failed: string[] = [], errors: unknown[] = [];
    await pool(BIN_PAGES, 3, async ([slug, group, label]) => {
      try {
        const days = parseBinPage(await fetchHTML(`https://loftiacodex.com/bins/${slug}/`), today);
        let added = 0;
        for (const [d, items] of days) {
          if (d < today) continue;
          for (const [qty, name] of items) { schedule.push({ date: d, group, bin: label, name, quantity: qty }); added++; }
        }
        if (!added) { failed.push(label); errors.push(new Error('no upcoming requests')); }
      } catch (e) { failed.push(label); errors.push(e); }
    });
    if (failed.length === BIN_PAGES.length) return reply({ error: explainFailure(errors) }, 502);
    for (const r of prev.schedule || []) if (failed.includes(r.bin) && r.date >= today) schedule.push(r);
    schedule.sort((a: any, b: any) => a.date.localeCompare(b.date) || a.bin.localeCompare(b.bin));

    // 2. recipes for dishes the website's recipe book doesn't have
    const extra: Record<string, unknown[]> = { ...(prev.extra_recipes || {}) };
    const dishes = [...new Set(schedule.filter((r: any) => r.group === 'Global Village').map((r: any) => r.name as string))];
    const missingRecipes: string[] = [];
    await pool(dishes.filter((d) => !knownDishes.has(d) && !extra[d]), 3, async (d) => {
      try { const rec = parseRecipe(await fetchHTML(`https://loftiacodex.com/items/${slugify(d)}/`)); if (rec.length) extra[d] = rec; else missingRecipes.push(d); }
      catch { missingRecipes.push(d); }
    });

    // 3. rarity + where to find it, for fish and artifacts we don't know yet
    const info: Record<string, Record<string, string>> = { ...(prev.item_info || {}) };
    const names = [...new Set(schedule.filter((r: any) => TASK_GROUPS.includes(r.group)).map((r: any) => r.name as string))];
    const todo = names.filter((n) => { const i = info[slugify(n)] || {}; return !(i.rarity && (i.location || i.district)); });
    await pool(todo, 3, async (n) => {
      try {
        const got = parseItemInfo(await fetchHTML(`https://loftiacodex.com/items/${slugify(n)}/`));
        if (Object.keys(got).length) info[slugify(n)] = { ...(info[slugify(n)] || {}), ...got, checked: today };
      } catch { /* try again next update */ }
    });
    const infoUnknown = names.filter((n) => { const i = info[slugify(n)] || {}; return !(i.rarity && (i.location || i.district)); }).length;

    const data = {
      schedule, extra_recipes: extra, item_info: info, source: 'loftiacodex.com',
      updated_at: new Date().toISOString(), failed_bins: failed, missing_recipes: missingRecipes, info_unknown: infoUnknown,
    };
    const { error } = await admin.from('app_data').upsert({ id: 'requests', data, updated_at: data.updated_at });
    if (error) throw error;
    return reply({ ok: true, data });
  } catch (e) {
    return reply({ error: `Update failed on the server: ${(e as Error).message || e}` }, 500);
  }
});
