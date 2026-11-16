"""Reads where every gathering spot is (districts, areas and how many) from the codex's live spot pages, and saves
it to data/spots-live.json for the website's planner. Run weekly by .github/workflows/update-map.yml.

1. Finds every spot named on item pages (materials, crops, artifacts, clothing pieces) - plain downloads.
2. Opens each spot page in a local browser fed from plain downloads (like the bin reader), so the codex's script
   fills in "Where to find it", then reads that section.
"""
import datetime
import html as htmllib
import json
import os
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor, as_completed

from playwright.sync_api import sync_playwright

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from read_bins import SITE, download, serve   # same plain-download + local browser approach as the bin reader

OUT = os.environ.get('OUT_FILE', 'data/spots-live.json')
HERE = os.path.dirname(os.path.abspath(__file__))
WAIT_MS = int(os.environ.get('WAIT_MS', '20000'))
DISCOVERY_BUDGET = int(os.environ.get('DISCOVERY_SECONDS', '1200'))   # stop looking for new spots after 20 minutes
CATEGORIES = {'materials', 'crops', 'flowers', 'artifacts', 'item fragments'}


def item_slugs(list_html):
    """Item addresses in the gathered categories on the /items/ page."""
    slugs, cur = [], None
    for m in re.finditer(r'<h([23])[^>]*>(.*?)</h\1>|href="(?:https?://[^"/]+)?/items/([a-z0-9-]+)/?"', list_html, re.S):
        if m.group(2) is not None:
            title = re.sub(r'\s+[\d,]+$', '', ' '.join(htmllib.unescape(re.sub(r'<[^>]+>', ' ', m.group(2))).split())).lower()
            cur = title if m.group(1) == '3' else None
        elif cur in CATEGORIES and m.group(3) not in slugs:
            slugs.append(m.group(3))
    return slugs


def parse_where(lines, links):
    """Lines like 'The Gridfall', '86' or 'The Gridfall 86' or '86 in The Gridfall' -> [{label, count}]."""
    rows, pending = [], None
    for t in lines:
        m = re.match(r'^(.*?[A-Za-z].*?)\s*[\u00d7x:]?\s*(\d+)$', t) or re.match(r'^(\d+)\s*(?:\u00d7|x|in|spots? in)?\s*(.*[A-Za-z].*)$', t)
        if m:
            a, b = m.group(1), m.group(2)
            label, count = (a, int(b)) if b.isdigit() else (b, int(a))
            rows.append({'label': label.strip(' -\u00b7:'), 'count': count}); pending = None
        elif t.isdigit() and pending:
            rows.append({'label': pending, 'count': int(t)}); pending = None
        elif re.search(r'[A-Za-z]', t) and len(t) < 60:
            if pending:
                rows.append({'label': pending, 'count': None})
            pending = t
    if pending:
        rows.append({'label': pending, 'count': None})
    for a in links:   # links to a district or area on the map
        m = re.search(r'(?:district|area|zone)[=/]([a-z0-9-]+)|#([a-z0-9-]+)$', a.get('href') or '')
        if m and a.get('text') and not any(r['label'] == a['text'] for r in rows):
            rows.append({'label': a['text'], 'count': None, 'hint': m.group(1) or m.group(2)})
    junk = re.compile(r'^(where to find it|spots?|show on map|open map|map|view on map|regular|shiny|urbex)$', re.I)
    return [r for r in rows if r['label'] and not junk.match(r['label'])]


def main():
    status, _, body = download(f'{SITE}/items/')
    if status >= 400:
        print(f'Could not read the item list (HTTP {status}).'); sys.exit(1)
    items = item_slugs(body.decode('utf-8', 'replace'))
    print(f'{len(items)} gathered items to check for spots')
    # Spots each item drops at, remembered from earlier runs - only items not seen before are downloaded.
    try:
        prev = json.load(open(OUT, encoding='utf-8'))
    except Exception:   # noqa: BLE001 - first run
        prev = {}
    item_spots = {k: v for k, v in (prev.get('item_spots') or {}).items() if k in items}
    todo = [s_ for s_ in items if s_ not in item_spots]
    print(f'{len(items) - len(todo)} items remembered from last time, {len(todo)} to check', flush=True)
    skipped, started = [], time.time()

    def check(slug):
        st, _, page = download(f'{SITE}/items/{slug}/')
        time.sleep(0.25)   # be gentle with the fan site
        if st >= 400:
            return slug, None
        return slug, sorted(set(re.findall(r'/spots/([a-z0-9-]+)', page.decode('utf-8', 'replace'))))

    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(check, s_) for s_ in todo]
        for i, f in enumerate(as_completed(futures)):
            slug, found = f.result()
            if found is None:
                skipped.append(slug)
            else:
                item_spots[slug] = found
            if (i + 1) % 25 == 0:
                print(f'  checked {i + 1} of {len(todo)} items ({int(time.time() - started)}s)', flush=True)
            if time.time() - started > DISCOVERY_BUDGET:
                print(f'  time limit reached after {i + 1} items - carrying on with the spots found so far', flush=True)
                for g in futures:
                    g.cancel()
                break
    spots = {}
    for slug, found in item_spots.items():
        for s_ in found:
            spots.setdefault(s_, set()).add(slug)
    print(f'{len(spots)} gathering spots found' + (f' ({len(skipped)} item pages could not be read: {", ".join(skipped[:10])})' if skipped else ''), flush=True)
    if not spots:
        print('No spots found - the item pages could not be read. The last saved map is kept.'); sys.exit(1)
    reader = open(os.path.join(HERE, 'spot-page-reader.js'), encoding='utf-8').read()
    ready = '() => { try { const r = ' + reader.strip().rstrip(';') + '; return r.found && r.lines.length > 0; } catch (e) { return false; } }'
    out, failed, shown = {}, [], False
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.route('**/*', serve)
        for slug in sorted(spots):
            url = f'{SITE}/spots/{slug}/'
            try:
                if download(url)[0] >= 400:
                    raise RuntimeError('page download refused')
                page.goto(url, wait_until='domcontentloaded', timeout=60000)
                try:
                    page.wait_for_function(ready, timeout=WAIT_MS)
                except Exception:
                    pass
                page.wait_for_timeout(1000)
                res = page.evaluate(reader)
                rows = parse_where(res.get('lines') or [], res.get('links') or [])
                if not rows:
                    if not shown:
                        print(f'---- what /spots/{slug}/ looked like (send this to Claude if the map stays empty) ----')
                        print('lines:', res.get('lines')); print('links:', res.get('links')); print('----')
                        shown = True
                    raise RuntimeError('"Where to find it" stayed empty')
                out[slug] = {'name': page.title().split(' -- ')[0].strip(), 'where': rows}
                print(f'OK   [{len(out)}/{len(spots)}] {slug}: ' + ', '.join(f"{r['label']}{' ' + str(r['count']) if r['count'] is not None else ''}" for r in rows[:6]))
            except Exception as e:   # noqa: BLE001
                failed.append(slug)
                print(f'FAIL {slug}: {e}')
        browser.close()
    if not out:
        print('No spot page could be read. The last saved map is kept.'); sys.exit(1)
    try:
        old = json.load(open(OUT, encoding='utf-8')).get('spots', {})
    except Exception:   # noqa: BLE001
        old = {}
    for s in failed:
        if s in old:
            out[s] = old[s]
    os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'), 'spots': out, 'failed': failed,
                   'item_spots': item_spots}, f, indent=1)
        f.write('\n')
    print(f'Saved {len(out)} spots ({len(failed)} could not be read).')


if __name__ == '__main__':
    main()
