"""Reads the live bin requests (today and the six days after) for the nine codex bins.

How: each bin page and the codex's own script files are downloaded the plain way (like the picture saver), then
opened in a browser on this machine that never contacts the codex itself - every file it asks for is served from
those downloads. The codex's script then works out the live week from today's date, exactly as in your browser,
and the result is saved to data/requests-live.json for the website's "Update requests" button.
Run by .github/workflows/update-bins.yml.
"""
import datetime
import html as htmllib
import json
import os
import re
import sys
import urllib.error
import urllib.request

from playwright.sync_api import sync_playwright

SITE = os.environ.get('CODEX_SITE', 'https://loftiacodex.com').rstrip('/')
OUT = os.environ.get('OUT_FILE', 'data/requests-live.json')
HERE = os.path.dirname(os.path.abspath(__file__))
UA = 'LoftiaDashboard/1.0 (personal bin tracker; https://github.com)'
BINS = [
    ('floating-village-bin-lv1', 'Floating Village', 'Floating Village Lv.1'), ('floating-village-bin-lv2', 'Floating Village', 'Floating Village Lv.2'),
    ('floating-village-bin-lv3', 'Floating Village', 'Floating Village Lv.3'), ('global-village-bin-lv1', 'Global Village', 'Global Village Lv.1'),
    ('global-village-bin-lv2', 'Global Village', 'Global Village Lv.2'), ('global-village-bin-lv3', 'Global Village', 'Global Village Lv.3'),
    ('museum-bin-lv1', 'Museum', 'Museum Lv.1'), ('museum-bin-lv2', 'Museum', 'Museum Lv.2'), ('museum-bin-lv3', 'Museum', 'Museum Lv.3'),
]


_cache = {}


def download(url):
    """Plain download (no browser) -> (status, content type, bytes). Cached for the run."""
    if url in _cache:
        return _cache[url]
    req = urllib.request.Request(url, headers={'User-Agent': UA, 'Accept': '*/*'})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            res = (r.status, r.headers.get('Content-Type', 'application/octet-stream'), r.read())
    except urllib.error.HTTPError as e:
        res = (e.code, e.headers.get('Content-Type', 'text/plain'), e.read() or b'')
    _cache[url] = res
    return res


def serve(route):
    req = route.request
    url = req.url
    if not url.startswith(SITE) or req.method != 'GET' or req.resource_type in ('image', 'font', 'media'):
        return route.abort()   # pictures, fonts and outside services aren't needed to work out the week
    try:
        status, ctype, body = download(url)
    except Exception:   # noqa: BLE001 - a script that won't download just gets skipped
        return route.abort()
    route.fulfill(status=status, headers={'Content-Type': ctype, 'Access-Control-Allow-Origin': '*'}, body=body)


def saved_pool(html):
    """The "Every request" sets as written in the plain page: [[(qty, name), ...], ...]."""
    m = re.search(r'Every request\s*</h[1-4]>(.*?)(?:<h[1-4][\s>]|</main>|$)', html, re.S | re.I)
    if not m:
        return []
    out = []
    for li in re.findall(r'<li[^>]*>(.*?)</li>', m.group(1), re.S | re.I):
        req = []
        for a in re.findall(r'<a[^>]*href="[^"]*/items/[^"]*"[^>]*>(.*?)</a>', li, re.S | re.I):
            t = re.sub(r'<[^>]+>', ' ', a)
            t = re.sub(r'\s+', ' ', t.replace('&#39;', "'").replace('&amp;', '&').replace('&#x27;', "'")).strip()
            q = re.match(r'^(\d+)\s*(.+)$', t)
            if q:
                req.append((int(q.group(1)), q.group(2)))
        if req:
            out.append(req)
    return out


def saved_pool(page_html):
    """The "Every request" list from the plain (saved) page, which always shows amounts: [[(qty, name)], ...]"""
    i = page_html.lower().find('every request')
    if i < 0:
        return []
    section = re.split(r'<h[1-4][\s>]', page_html[i:], maxsplit=2)
    section = section[1] if len(section) > 1 else page_html[i:]
    out = []
    for li in re.findall(r'<li[^>]*>(.*?)</li>', section, re.S):
        req = []
        for a in re.findall(r'<a[^>]*>(.*?)</a>', li, re.S):
            t = ' '.join(htmllib.unescape(re.sub(r'<[^>]+>', ' ', a)).split())
            m = re.match(r'^(\d+)\s+(.+)$', t)
            if m:
                req.append((int(m.group(1)), m.group(2)))
        if req:
            out.append(req)
    return out


def fill_amounts(items, pool):
    """Live cards may only show pictures: take the amounts from the matching request in "Every request"."""
    if all(it.get('qty') for it in items):
        return items
    names = {it['name'].lower() for it in items}
    match = next((req for req in pool if {n.lower() for _, n in req} == names), None)
    if match is None:   # fall back to any request that has the item
        amounts = {}
        for req in pool:
            for q, n in req:
                amounts.setdefault(n.lower(), q)
    else:
        amounts = {n.lower(): q for q, n in match}
    return [dict(it, qty=it.get('qty') or amounts.get(it['name'].lower()) or 1) for it in items]


def resolve(label, today):
    m = re.search(r'\b(Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\.?\s+(\d{1,2})\b', label)
    if not m:
        return None
    wd = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].index(m.group(1))
    hits = [today + datetime.timedelta(days=k) for k in range(-14, 15)]
    hits = [d for d in hits if d.weekday() == wd and d.day == int(m.group(2))]
    return min(hits, key=lambda d: abs((d - today).days)) if hits else None


def dated(days, today):
    base = None
    for k, d in enumerate(days):
        r = resolve(d['label'], today)
        if r:
            base = r - datetime.timedelta(days=k)
            break
    base = base or today
    out = []
    for k, d in enumerate(days):
        low = d['label'].lower()
        date = base if 'today' in low else base + datetime.timedelta(days=1) if 'tomorrow' in low else (resolve(d['label'], today) or base + datetime.timedelta(days=k))
        out.append((date.isoformat(), d['items']))
    return out


def main():
    reader = open(os.path.join(HERE, 'bin-page-reader.js'), encoding='utf-8').read()
    today = datetime.date.today()
    schedule, pools, failed = [], {}, []
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.route('**/*', serve)
        for slug, group, bin_ in BINS:
            url = f'{SITE}/bins/{slug}/'
            try:
                status, _, body = download(url)
                if status >= 400:
                    raise RuntimeError(f'the page download was refused (HTTP {status})')
                pool_saved = saved_pool(body.decode('utf-8', 'replace'))
                page.goto(url, wait_until='domcontentloaded', timeout=60000)
                page.wait_for_function('() => { const r = ' + reader.strip().rstrip(';') + '; return r.days.length > 0 && r.days.every((d) => d.items.length > 0); }', timeout=30000)
                page.wait_for_timeout(2500)   # let the codex's script finish updating the days
                res = page.evaluate(reader)
                # quantities the cards don't show: take them from this bin's "Every request" sets
                sets = [[(it['qty'], it['name']) for it in r] for r in (res.get('pool') or [])] or saved_pool(download(url)[2].decode('utf-8', 'replace'))
                lookup = {tuple(sorted(n for _, n in r)): dict((n, q) for q, n in r) for r in sets}
                for d in res.get('days') or []:
                    if any(it.get('guessed') for it in d['items']):
                        found = lookup.get(tuple(sorted(it['name'] for it in d['items'])))
                        for it in d['items']:
                            if it.get('guessed') and found and it['name'] in found:
                                it['qty'], it['guessed'] = found[it['name']], False
                if not res.get('pool') and sets:
                    res['pool'] = [[{'qty': q, 'name': n} for q, n in r] for r in sets]
                pool_live = [[(it['qty'], it['name']) for it in req if it.get('qty')] for req in (res.get('pool') or [])]
                pool_live = [r for r in pool_live if r]
                pool = pool_live if len(pool_live) >= len(pool_saved) else pool_saved
                days = dated(res.get('days') or [], today)
                if not days:
                    raise RuntimeError('no days listed')
                for date, items in days:
                    for it in fill_amounts(items, pool):
                        schedule.append({'date': date, 'group': group, 'bin': bin_, 'name': it['name'], 'quantity': it['qty']})
                if pool:
                    pools[bin_] = [[[q, n] for q, n in req] for req in pool]
                labels = ', '.join(d['label'] for d in res['days'])
                guessed = sum(1 for d in res['days'] for it in d['items'] if it.get('guessed'))
                if guessed:
                    print(f'NOTE {bin_}: {guessed} quantities not shown on the page and not in its rotation list - counted as 1')
                print(f'OK   {bin_}: {days[0][0]} to {days[-1][0]} (labels: {labels}), {len(pool)} requests in rotation')
            except Exception as e:   # noqa: BLE001
                failed.append(bin_)
                print(f'FAIL {bin_}: {e}')
        browser.close()
    if len(failed) == len(BINS):
        print('Could not read any bin page (see the FAIL lines above). The last saved list is kept.')
        sys.exit(1)
    try:
        old = json.load(open(OUT, encoding='utf-8'))
    except Exception:   # noqa: BLE001 - first run
        old = {}
    for r in old.get('schedule', []):   # a bin that failed keeps its last list
        if r.get('bin') in failed and r.get('date', '') >= today.isoformat():
            schedule.append(r)
    for b in failed:
        if b in old.get('pools', {}):
            pools[b] = old['pools'][b]
    os.makedirs(os.path.dirname(OUT) or '.', exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump({'generated_at': datetime.datetime.now(datetime.timezone.utc).isoformat(timespec='seconds'),
                   'today': today.isoformat(), 'schedule': schedule, 'pools': pools, 'failed': failed}, f, indent=1)
        f.write('\n')
    last = max((r['date'] for r in schedule), default='')
    print(f'Saved {len(schedule)} requests, {today.isoformat()} to {last}' + (f' ({len(failed)} bins kept from last time)' if failed else '') + '.')


if __name__ == '__main__':
    main()
