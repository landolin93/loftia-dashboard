// Downloads every item picture from loftiacodex.com into the icons/ folder of this repository,
// so the website keeps its pictures even if the codex goes away. Run by .github/workflows/save-icons.yml.
// Only pictures that aren't saved yet are downloaded. Needs Node 18+ (built-in fetch).
import fs from 'node:fs';
import path from 'node:path';

const SITE = process.env.CODEX_SITE || 'https://loftiacodex.com';
const DIR = path.resolve(process.env.ICON_DIR || 'icons');
const UA = 'Mozilla/5.0 (compatible; LoftiaDashboardIconSaver/1.0; +https://github.com)';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url, tries = 3) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(20000) });
      return res;
    } catch (e) {
      if (i >= tries) throw e;
      await sleep(1000 * i);
    }
  }
}

/** Every item address on the codex item list, e.g. "plastic-sheet", "party-hat-3". */
export function itemSlugs(html) {
  const out = new Set();
  for (const m of html.matchAll(/href="(?:https?:\/\/[^"/]+)?\/items\/([a-z0-9-]+)\/?"/g)) out.add(m[1]);
  return [...out];
}
/** The picture address an item page shows (og:image), as a fallback when it isn't icons/<slug>.webp. */
export function pageIcon(html) {
  const m = /<meta[^>]+property="og:image"[^>]+content="([^"]+)"/i.exec(html) || /<meta[^>]+content="([^"]+)"[^>]+property="og:image"/i.exec(html);
  return m ? m[1] : null;
}
const isImage = (res) => res.ok && /^image\//i.test(res.headers.get('content-type') || '');

export async function saveIcons({ log = console.log } = {}) {
  fs.mkdirSync(DIR, { recursive: true });
  const listRes = await get(`${SITE}/items/`);
  if (!listRes.ok) throw new Error(`Couldn't read the item list (HTTP ${listRes.status})`);
  const slugs = itemSlugs(await listRes.text());
  if (slugs.length < 100) throw new Error(`The item list looks wrong (only ${slugs.length} items found) - nothing was changed.`);
  const todo = slugs.filter((s) => !fs.existsSync(path.join(DIR, `${s}.webp`)));
  log(`${slugs.length} items on the codex, ${slugs.length - todo.length} pictures already saved, ${todo.length} to download.`);
  let saved = 0, missing = [];
  let i = 0;
  const worker = async () => {
    while (i < todo.length) {
      const slug = todo[i++];
      try {
        let res = await get(`${SITE}/icons/${slug}.webp`);
        if (!isImage(res)) {          // the picture has a different name: ask the item page
          const page = await get(`${SITE}/items/${slug}/`);
          const src = page.ok ? pageIcon(await page.text()) : null;
          res = src ? await get(new URL(src, SITE).href) : null;
        }
        if (res && isImage(res)) {
          fs.writeFileSync(path.join(DIR, `${slug}.webp`), Buffer.from(await res.arrayBuffer()));
          saved++;
        } else missing.push(slug);
      } catch { missing.push(slug); }
      await sleep(120);   // be gentle with the fan site
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  const all = fs.readdirSync(DIR).filter((f) => f.endsWith('.webp')).map((f) => f.slice(0, -5)).sort();
  fs.writeFileSync(path.join(DIR, 'index.json'), JSON.stringify({ updated: new Date().toISOString(), icons: all }) + '\n');
  log(`Saved ${saved} new pictures. ${all.length} pictures in total.${missing.length ? ` No picture found for ${missing.length}: ${missing.slice(0, 15).join(', ')}${missing.length > 15 ? '\u2026' : ''}` : ''}`);
  return { saved, total: all.length, missing };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  saveIcons().catch((e) => {
    // If the codex is down, keep the pictures we already have and don't fail the run.
    console.log(`Could not reach loftiacodex.com: ${e.message}. Existing pictures are kept.`);
    process.exit(0);
  });
}
