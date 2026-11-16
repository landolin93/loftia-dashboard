// Runs inside the browser on a codex bin page (after the page's own script has worked out the days).
// Returns { days: [{label, items:[{qty, name}]}], pool: [[{qty, name}]] }.
(() => {
  const heads = [...document.querySelectorAll('h1, h2, h3, h4')];
  const listAfter = (title) => {
    const h = heads.find((x) => x.textContent.trim().toLowerCase().startsWith(title));
    if (!h) return null;
    for (let el = h.nextElementSibling; el; el = el.nextElementSibling) {
      if (/^H[1-4]$/.test(el.tagName)) return null;
      if (/^(OL|UL)$/.test(el.tagName)) return el;
      const inner = el.querySelector('ol, ul');
      if (inner) return inner;
    }
    return null;
  };
  const readItem = (a) => {
    const t = /^\s*(\d+)\s*[x\u00d7]?\s+(.+?)\s*$/.exec(a.getAttribute('title') || '');
    if (t) return { qty: Number(t[1]), name: t[2] };
    const txt = a.textContent.replace(/\s+/g, ' ').trim();
    let m = /^(\d+)\s+(.+)$/.exec(txt);
    if (m) return { qty: Number(m[1]), name: m[2] };
    const img = a.querySelector('img[alt]');
    m = /(\d+)/.exec(txt);
    if (img && img.alt.trim()) return { qty: m ? Number(m[1]) : 1, name: img.alt.trim() };
    return null;
  };
  const read = (list, withLabel) => (list ? [...list.children].filter((li) => li.tagName === 'LI').map((li) => {
    const items = [...li.querySelectorAll('a[href*="/items/"]')].map(readItem).filter(Boolean);
    if (!withLabel) return items;
    const c = li.cloneNode(true);
    c.querySelectorAll('a').forEach((a) => a.remove());
    return { label: c.textContent.replace(/\s+/g, ' ').trim(), items };
  }) : []);
  return { days: read(listAfter('next seven days'), true), pool: read(listAfter('every request'), false).filter((r) => r.length) };
})()
