// Runs inside the browser on a codex spot page (e.g. /spots/oven/) after the codex's script has filled in
// "Where to find it". Returns the raw lines and links of that section; tools/read_spots.py works out the
// districts, areas and counts from them.
(() => {
  const heads = [...document.querySelectorAll('h1,h2,h3')];
  const h = heads.find((x) => /where to find it/i.test(x.textContent));
  if (!h) return { found: false, lines: [], links: [] };
  const box = document.createElement('div');
  for (let el = h.nextElementSibling; el && !/^H[12]$/.test(el.tagName); el = el.nextElementSibling) box.appendChild(el.cloneNode(true));
  // if the heading sits inside its own wrapper, take the wrapper's following content instead
  if (!box.textContent.trim() && !box.querySelector('[aria-label],[title]') && h.parentElement) {
    for (let el = h.parentElement.nextElementSibling; el && !el.querySelector('h1,h2') && !/^H[12]$/.test(el.tagName); el = el.nextElementSibling) box.appendChild(el.cloneNode(true));
  }
  const lines = [];
  const walk = (n) => {
    for (const c of n.childNodes) {
      if (c.nodeType === 3) { const t = c.textContent.replace(/\s+/g, ' ').trim(); if (t) lines.push(t); }
      else if (c.nodeType === 1 && !/^(SCRIPT|STYLE|SVG)$/i.test(c.tagName)) walk(c);
    }
  };
  walk(box);
  // map markers often carry their place in a label rather than visible text
  for (const el of box.querySelectorAll('[aria-label],[title],[data-district],[data-area],[data-name]')) {
    for (const v of [el.getAttribute('aria-label'), el.getAttribute('title'), el.dataset.district, el.dataset.area, el.dataset.name]) {
      const t = (v || '').replace(/\s+/g, ' ').trim();
      if (t && t.length < 60 && !lines.includes(t)) lines.push(t);
    }
  }
  const links = [...box.querySelectorAll('a[href]')].map((a) => ({ text: a.textContent.replace(/\s+/g, ' ').trim(), href: a.getAttribute('href') }));
  return { found: true, lines: lines.slice(0, 200), links: links.slice(0, 100) };
})()
