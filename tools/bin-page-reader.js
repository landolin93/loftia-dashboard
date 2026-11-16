// Runs inside the browser on a codex bin page, after the page's own script has worked out the days.
// Understands both layouts: the simple list ("Today 4 Allis Shad 2 Rainbow Trout") and the live card row
// (a card per day with item pictures). Returns { days: [{label, items:[{qty, name}]}], pool: [[{qty, name}]] }.
// qty is null when the page only shows a picture - the amount is then taken from the bin's "Every request" list.
(() => {
  const LABEL = /^(today|tomorrow|(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?\s+\d{1,2})$/i;
  const heads = [...document.querySelectorAll('h1,h2,h3,h4')];
  const head = (t) => heads.find((h) => h.textContent.trim().toLowerCase().startsWith(t));
  const after = (a, b) => !!(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const slugOf = (el) => {
    const a = el.tagName === 'A' ? el : el.closest('a');
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    const m = /\/items\/([a-z0-9-]+)/.exec((a && a.getAttribute('href')) || '') || /\/icons\/([a-z0-9-]+)\.(?:webp|png|jpe?g)/.exec((img && (img.getAttribute('src') || img.currentSrc)) || '');
    return m ? m[1] : '';
  };
  const slugName = (slug) => (slug ? slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()) : '');
  const readItem = (el) => {
    const a = el.tagName === 'A' ? el : el.closest('a');
    const img = el.tagName === 'IMG' ? el : el.querySelector('img');
    const title = ((a && a.getAttribute('title')) || el.getAttribute('title') || '').trim();
    let m = /^(\d+)\s*[x\u00d7]?\s+(.+)$/.exec(title);
    if (m) return { qty: Number(m[1]), name: m[2].trim() };
    const txt = (a || el).textContent.replace(/\s+/g, ' ').trim();
    m = /^(\d+)\s+(.+)$/.exec(txt);
    if (m) return { qty: Number(m[1]), name: m[2].trim() };
    const aria = ((a && a.getAttribute('aria-label')) || '').trim();
    m = /^(\d+)\s*[x\u00d7]?\s+(.+)$/.exec(aria);
    if (m) return { qty: Number(m[1]), name: m[2].trim() };
    const slug = slugOf(el);
    const name = (img && (img.getAttribute('alt') || '').trim()) || title || aria.replace(/\s*[x\u00d7]?\s*\d+$/, '')
      || (txt && !/^\d+$/.test(txt) ? txt.replace(/\s*[x\u00d7]?\s*\d+$/, '') : '') || slugName(slug);
    const q = /(\d+)/.exec(txt) || /(\d+)/.exec(aria);
    return name ? { qty: q ? Number(q[1]) : null, name, slug } : null;
  };
  const itemsIn = (box) => {
    const links = [...box.querySelectorAll('a[href*="/items/"]')];
    const pics = [...box.querySelectorAll('img')].filter((i) => (i.getAttribute('alt') || '').trim() || /\/icons\/[a-z0-9-]+\./.test(i.getAttribute('src') || i.currentSrc || ''));
    const els = links.length ? links : pics;
    const out = [], seen = new Set();
    for (const e of els) { const it = readItem(e); if (it && !seen.has(it.name)) { seen.add(it.name); out.push(it); } }
    return out;
  };
  // Card layout: find each day label, then the card around it that holds that day's items.
  const cardDays = () => {
    const h = head('next seven days');
    if (!h) return [];
    const stop = head('every request');
    // a day label is an element whose own text (not counting what's inside its child elements) is "Today", "Wed 18"...
    const ownText = (x) => [...x.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join(' ').replace(/\s+/g, ' ').trim();
    const labels = [...document.querySelectorAll('body *')].filter((x) => LABEL.test(x.children.length === 0 ? x.textContent.trim() : ownText(x))
      && after(h, x) && !(stop && after(stop, x)));
    // A day's card is the nearest box around its label that has items - but it must not reach another
    // day's label or the "Every request" list (that would mix days up).
    const inBox = (box, el) => box !== el && box.contains(el);
    return labels.map((lb) => {
      let card = itemsIn(lb).length ? lb : lb.parentElement;
      while (card && card !== document.body && itemsIn(card).length === 0) {
        const up = card.parentElement;
        if (!up || labels.some((o) => o !== lb && inBox(up, o)) || (stop && inBox(up, stop)) || up.contains(h)) { card = null; break; }
        card = up;
      }
      const ok = card && card !== document.body && !labels.some((o) => o !== lb && inBox(card, o)) && !(stop && inBox(card, stop));
      return { label: (lb.children.length === 0 ? lb.textContent : ownText(lb)).replace(/\s+/g, ' ').trim(), items: ok ? itemsIn(card) : [] };
    }).filter((d) => d.items.length);
  };
  // Simple list layout (the saved page): <ol><li>Today <a title="4 Allis Shad">...</li>...
  const listAfter = (title) => {
    const h = head(title);
    if (!h) return null;
    for (let el = h.nextElementSibling; el; el = el.nextElementSibling) {
      if (/^H[1-4]$/.test(el.tagName)) return null;
      if (/^(OL|UL)$/.test(el.tagName)) return el;
      const inner = el.querySelector('ol, ul');
      if (inner) return inner;
    }
    return null;
  };
  const listDays = () => {
    const list = listAfter('next seven days');
    return list ? [...list.children].filter((li) => li.tagName === 'LI').map((li) => {
      const c = li.cloneNode(true);
      c.querySelectorAll('a').forEach((a) => a.remove());
      return { label: c.textContent.replace(/\s+/g, ' ').trim(), items: itemsIn(li) };
    }) : [];
  };
  const poolRows = () => {
    const list = listAfter('every request');
    if (list) return [...list.children].filter((li) => li.tagName === 'LI').map(itemsIn).filter((r) => r.length);
    const h = head('every request');   // card layout: rows that each hold a request's items
    if (!h) return [];
    const rows = [...document.querySelectorAll('body *')].filter((x) => after(h, x) && itemsIn(x).length >= 1
      && [...x.children].every((ch) => itemsIn(ch).length < itemsIn(x).length || ch.tagName === 'A' || ch.tagName === 'IMG'));
    return rows.map(itemsIn);
  };
  const cards = cardDays();
  const list = listDays();
  return { days: cards.length >= list.length ? cards : list, pool: poolRows() };
})()
