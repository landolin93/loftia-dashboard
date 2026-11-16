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
export async function readBins({ log = console.log } = {}) {
  const browser = await chromium.launch();
  const page = await browser.newPage({ userAgent: 'Mozilla/5.0 (compatible; LoftiaDashboardBinReader/1.0)' });
  const today = iso(new Date());
  const schedule = [], pools = {}, failed = [];
  for (const [slug, group, bin] of BIN_PAGES) {
    try {
      await page.goto(`${SITE}/bins/${slug}/`, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForTimeout(1500);   // let the page's own script update the days
      const res = await page.evaluate(READER);
      const days = datesFor(res.days || [], today);
      if (!days.length) throw new Error('no days listed');
      for (const d of days) for (const it of d.items) schedule.push({ date: d.date, group, bin, name: it.name, quantity: it.qty });
      if (res.pool?.length) pools[bin] = res.pool.map((r) => r.map((it) => [it.qty, it.name]));
      log(`${bin}: ${days[0].date} to ${days[days.length - 1].date}, ${res.pool?.length || 0} requests in rotation`);
    } catch (e) { failed.push(bin); log(`${bin}: couldn't read (${e.message})`); }
  }
  await browser.close();
  if (failed.length === BIN_PAGES.length) throw new Error('No bin page could be read.');
  let old = null;
  try { old = JSON.parse(fs.readFileSync(OUT, 'utf8')); } catch { /* first run */ }
  for (const r of old?.schedule || []) if (failed.includes(r.bin) && r.date >= today) schedule.push(r);   // keep a failed bin's last list
  for (const b of failed) if (old?.pools?.[b]) pools[b] = old.pools[b];
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ generated_at: new Date().toISOString(), today, schedule, pools, failed }, null, 1) + '\n');
  log(`Saved ${schedule.length} requests from ${today}${failed.length ? ` (${failed.length} bins kept from last time)` : ''}.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  readBins().catch((e) => { console.log(`Could not read the bins: ${e.message}. The last saved list is kept.`); process.exit(0); });
}
