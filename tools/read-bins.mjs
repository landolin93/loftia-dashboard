// Reads the live "Next seven days" and "Every request" lists from the nine codex bin pages with a real browser,
// and saves them to data/requests-live.json. Run by .github/workflows/update-bins.yml.
// The codex works out its days in the browser, so a plain page download can be days out of date - this can't.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { datesFor } from './bin-dates.mjs';
const iso = (d) => d.toISOString().slice(0, 10);

const SITE = process.env.CODEX_SITE || 'https://loftiacodex.com';
const OUT = path.resolve(process.env.OUT_FILE || 'data/requests-live.json');
const HERE = path.dirname(fileURLToPath(import.meta.url));
const READER = fs.readFileSync(path.join(HERE, 'bin-page-reader.js'), 'utf8');
export const BIN_PAGES = [
  ['floating-village-bin-lv1', 'Floating Village', 'Floating Village Lv.1'], ['floating-village-bin-lv2', 'Floating Village', 'Floating Village Lv.2'],
  ['floating-village-bin-lv3', 'Floating Village', 'Floating Village Lv.3'], ['global-village-bin-lv1', 'Global Village', 'Global Village Lv.1'],
  ['global-village-bin-lv2', 'Global Village', 'Global Village Lv.2'], ['global-village-bin-lv3', 'Global Village', 'Global Village Lv.3'],
  ['museum-bin-lv1', 'Museum', 'Museum Lv.1'], ['museum-bin-lv2', 'Museum', 'Museum Lv.2'], ['museum-bin-lv3', 'Museum', 'Museum Lv.3'],
];
const LIST_READY = `(() => {
  const h = [...document.querySelectorAll('h1,h2,h3,h4')].find((x) => x.textContent.trim().toLowerCase().startsWith('next seven days'));
  if (!h) return false;
  for (let el = h.nextElementSibling; el; el = el.nextElementSibling) {
    const list = /^(OL|UL)$/.test(el.tagName) ? el : el.querySelector('ol, ul');
    if (list) return list.querySelectorAll('li a[href*="/items/"]').length > 0;
    if (/^H[1-4]$/.test(el.tagName)) return false;
  }
  return false;
})()`;

async function readOne(page, slug) {
  const res = await page.goto(`${SITE}/bins/${slug}/`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  const status = res ? res.status() : 0;
  const title = await page.title().catch(() => '');
  if (status >= 400 || /just a moment|attention required|access denied/i.test(title)) {
    throw new Error(`the codex refused the visit (HTTP ${status}, page title "${title}")`);
  }
  await page.waitForFunction(LIST_READY, null, { timeout: 30000 });
  await page.waitForTimeout(2500);   // let the page's own script update the days
  return page.evaluate(READER);
}

export async function readBins({ log = console.log } = {}) {
  const browser = await chromium.launch({ args: ['--disable-blink-features=AutomationControlled'] });
  const context = await browser.newContext({
    // look like an everyday browser; some sites turn away "HeadlessChrome"
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
    locale: 'en-US', viewport: { width: 1280, height: 900 },
  });
  const page = await context.newPage();
  const today = iso(new Date());
  const schedule = [], pools = {}, failed = [];
  for (const [slug, group, bin] of BIN_PAGES) {
    let res = null, lastErr = null;
    for (let attempt = 1; attempt <= 2 && !res; attempt++) {
      try { res = await readOne(page, slug); } catch (e) { lastErr = e; await page.waitForTimeout(3000); }
    }
    try {
      if (!res) throw lastErr || new Error('unknown problem');
      const days = datesFor(res.days || [], today);
      if (!days.length) throw new Error('no days listed');
      for (const d of days) for (const it of d.items) schedule.push({ date: d.date, group, bin, name: it.name, quantity: it.qty });
      if (res.pool?.length) pools[bin] = res.pool.map((r) => r.map((it) => [it.qty, it.name]));
      log(`OK   ${bin}: ${days[0].date} to ${days[days.length - 1].date} (labels: ${res.days.map((d) => d.label).join(', ')}), ${res.pool?.length || 0} requests in rotation`);
    } catch (e) { failed.push(bin); log(`FAIL ${bin}: ${e.message}`); }
  }
  await browser.close();
  if (failed.length === BIN_PAGES.length) throw new Error('No bin page could be read (see the FAIL lines above).');
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  for (const r of old?.schedule || []) if (failed.includes(r.bin) && r.date >= today) schedule.push(r);   // keep a failed bin's last list
  for (const b of failed) if (old?.pools?.[b]) pools[b] = old.pools[b];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), today, schedule, pools, failed }, null, 1) + '\n');
  const last = schedule.reduce((m, r) => (r.date > m ? r.date : m), '');
  log(`Saved ${schedule.length} requests, ${today} to ${last}${failed.length ? ` (${failed.length} bins kept from last time)` : ''}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  readBins().catch((e) => { console.log(`Could not read the bins: ${e.message} The last saved list is kept.`); process.exit(1); });
}
