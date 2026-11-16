// "Grab bins" bookmark. Runs on loftiacodex.com in your own browser: opens the nine bin pages in the background,
// waits for the codex to work out each live week, reads "Next seven days" and "Every request", and sends them to
// your Loftia Dashboard. The dashboard turns this file into the bookmark for you (More -> Grab bins bookmark).
(async () => {
  const DASH = '__DASHBOARD_URL__';
  if (!/(^|\.)loftiacodex\.com$/.test(location.hostname)) {
    alert('Open loftiacodex.com first, then tap the Grab bins bookmark again.');
    location.href = 'https://loftiacodex.com/bins/';
    return;
  }
  if (window.__grabbingBins) return;
  window.__grabbingBins = true;
  const BINS = [
    ['floating-village-bin-lv1', 'Floating Village', 'Floating Village Lv.1'], ['floating-village-bin-lv2', 'Floating Village', 'Floating Village Lv.2'],
    ['floating-village-bin-lv3', 'Floating Village', 'Floating Village Lv.3'], ['global-village-bin-lv1', 'Global Village', 'Global Village Lv.1'],
    ['global-village-bin-lv2', 'Global Village', 'Global Village Lv.2'], ['global-village-bin-lv3', 'Global Village', 'Global Village Lv.3'],
    ['museum-bin-lv1', 'Museum', 'Museum Lv.1'], ['museum-bin-lv2', 'Museum', 'Museum Lv.2'], ['museum-bin-lv3', 'Museum', 'Museum Lv.3'],
  ];
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;z-index:2147483647;left:50%;top:16px;transform:translateX(-50%);max-width:90vw;background:#4B3628;color:#fff;padding:12px 18px;border-radius:14px;font:600 15px/1.4 system-ui,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.3);text-align:center';
  document.body.appendChild(box);
  const say = (t) => { box.textContent = t; };

  const READER = __READER_SRC__;   // tools/bin-page-reader.js, put in by the dashboard
  const readIn = (win) => { try { return win.eval(READER); } catch (e) { return { days: [], pool: [] }; } };
  const schedule = [], pools = {}, failed = [];
  const good = (r) => r && r.days && r.days.length > 0 && r.days.every((d) => d.items.length > 0);
  // Live day cards may only show pictures: take the amounts from the matching request in "Every request".
  const fill = (items, pool) => {
    if (items.every((it) => it.qty)) return items;
    const key = (list) => list.map((it) => it.name.toLowerCase()).sort().join('|');
    const match = (pool || []).find((req) => key(req) === key(items));
    const amounts = {};
    for (const req of match ? [match] : (pool || [])) for (const it of req) if (it.qty && !(it.name.toLowerCase() in amounts)) amounts[it.name.toLowerCase()] = it.qty;
    return items.map((it) => ({ qty: it.qty || amounts[it.name.toLowerCase()] || 1, name: it.name }));
  };
  const add = (r, group, bin) => {
    for (const d of dated(r.days)) for (const it of fill(d.items, r.pool)) schedule.push({ date: d.date, group, bin, name: it.name, quantity: it.qty });
    const pool = (r.pool || []).map((q) => q.filter((it) => it.qty).map((it) => [it.qty, it.name])).filter((q) => q.length);
    if (pool.length) pools[bin] = pool;
  };
  const p2 = (n) => String(n).padStart(2, '0');
  const iso = (d) => `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const addDays = (s, n) => { const [y, m, d] = s.split('-').map(Number); return iso(new Date(y, m - 1, d + n)); };
  const today = iso(new Date());
  const resolve = (label) => {
    const m = /\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+(\d{1,2})\b/.exec(label);
    if (!m) return null;
    const wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(m[1]);
    let best = null, dist = 99;
    for (let k = -14; k <= 14; k++) {
      const s = addDays(today, k), [y, mo, d] = s.split('-').map(Number), dt = new Date(y, mo - 1, d);
      if (dt.getDay() === wd && d === Number(m[2]) && Math.abs(k) < dist) { best = s; dist = Math.abs(k); }
    }
    return best;
  };
  const dated = (days) => {
    let base = null;
    days.some((d, k) => { const r = resolve(d.label); if (r) { base = addDays(r, -k); return true; } return false; });
    base = base || today;
    return days.map((d, k) => {
      const low = d.label.toLowerCase();
      return { date: low.includes('today') ? base : low.includes('tomorrow') ? addDays(base, 1) : (resolve(d.label) || addDays(base, k)), items: d.items };
    });
  };

  // Open a bin page in a hidden frame (same site, so it can be read once the codex's own script has run).
  const readBin = (slug) => new Promise((done) => {
    const f = document.createElement('iframe');
    f.style.cssText = 'position:fixed;left:-4000px;top:0;width:1100px;height:900px;opacity:0;pointer-events:none';
    f.src = `/bins/${slug}/`;
    const start = Date.now();
    let seen = 0, finished = false;
    const finish = (v) => { if (finished) return; finished = true; clearInterval(timer); f.remove(); done(v); };
    const timer = setInterval(() => {
      let doc = null;
      try { doc = f.contentDocument; } catch (e) { return finish({ error: 'the page could not be opened in the background' }); }
      if (doc && doc.location && doc.location.href !== 'about:blank' && doc.readyState !== 'loading') {
        const r = readIn(f.contentWindow);
        if (good(r)) {
          if (!seen) seen = Date.now();
          else if (Date.now() - seen > 1500) finish(r);
        }
      }
      if (Date.now() - start > 30000) finish({ error: 'timed out' });
    }, 300);
    document.body.appendChild(f);
  });

  const send = () => {
    const last = schedule.reduce((m, r) => (r.date > m ? r.date : m), '');
    say(`Got ${new Set(schedule.map((r) => r.bin)).size} bins, up to ${last}. Opening your dashboard\u2026`);
    try { localStorage.removeItem('loftia-grab-bins'); } catch (e) { /* ignore */ }
    location.href = `${DASH}#grab=${encodeURIComponent(JSON.stringify({ generated_at: new Date().toISOString(), today, schedule, pools, failed, via: 'browser' }))}`;
  };
  // Backup plan if the codex won't open its pages in the background: read the bin page you're on,
  // remember it, and send everything once all nine have been collected.
  const here = BINS.find(([slug]) => location.pathname.replace(/\/+$/, '').endsWith('/bins/' + slug));
  const collectHere = () => {
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('loftia-grab-bins') || '{}'); } catch (e) { saved = {}; }
    if (saved.today !== today) saved = { today, bins: {} };
    const mine = here ? readIn(window) : null;
    if (here && good(mine)) saved.bins[here[2]] = mine;
    try { localStorage.setItem('loftia-grab-bins', JSON.stringify(saved)); } catch (e) { /* ignore */ }
    const got = Object.keys(saved.bins);
    if (got.length < BINS.length) {
      const next = BINS.find(([, , bin]) => !saved.bins[bin]);
      say(`Saved ${got.length} of ${BINS.length} bins. This browser won\u2019t let the codex open pages in the background, so tap Grab bins on each bin page. Next: ${next[2]}\u2026`);
      setTimeout(() => { location.href = `/bins/${next[0]}/`; }, 2500);
      return true;
    }
    for (const [slug, group, bin] of BINS) {
      add(saved.bins[bin], group, bin);
    }
    send();
    return true;
  };
  let n = 0;
  const queue = [...BINS];
  const worker = async () => {
    while (queue.length) {
      const [slug, group, bin] = queue.shift();
      const res = await readBin(slug);
      n++;
      say(`Grabbing bins from the codex\u2026 ${n} of ${BINS.length}`);
      if (res.error || !res.days || !res.days.length) { failed.push(bin); continue; }
      add(res, group, bin);
    }
  };
  say(`Grabbing bins from the codex\u2026 0 of ${BINS.length}`);
  let pending = null;
  try { pending = JSON.parse(localStorage.getItem('loftia-grab-bins') || 'null'); } catch (e) { pending = null; }
  if (pending && pending.today === today && Object.keys(pending.bins || {}).length) { collectHere(); return; }
  await Promise.all([worker(), worker(), worker()]);
  window.__grabbingBins = false;
  if (!schedule.length) {
    if (here) { collectHere(); return; }
    say('Couldn\u2019t read the bin pages in the background. Opening the first bin page \u2013 tap Grab bins there.');
    setTimeout(() => { location.href = `/bins/${BINS[0][0]}/`; }, 2500);
    try { localStorage.setItem('loftia-grab-bins', JSON.stringify({ today, bins: {} })); } catch (e) { /* ignore */ }
    return;
  }
  send();
})();
