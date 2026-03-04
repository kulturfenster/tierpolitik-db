#!/usr/bin/env python3
import json
import re
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data' / 'stallbraende' / 'sources.v0.json'
OUT = ROOT / 'data' / 'stallbraende' / 'links.police.v1.jsonl'

POLICE_IDS = {'ch-be-police-news', 'ch-zh-police-news', 'ch-lu-police-news', 'ch-ag-police-news'}
HREF = re.compile(r'href=["\']([^"\']+)["\']', re.I)
KEEP = re.compile(r'(medien|mitteilung|news|aktuell|einsatz|brand|feuer|ereignis|detail|artikel|story)', re.I)


def fetch(url: str) -> str:
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 StallbraendeMonitor/0.4'})
    return urlopen(req, timeout=30).read().decode('utf-8', 'ignore')


def main():
    sources = json.loads(SRC.read_text(encoding='utf-8'))
    rows = []
    seen = set()

    for s in sources:
        sid = s.get('id')
        if sid not in POLICE_IDS:
            continue
        base = s.get('url')
        try:
            html = fetch(base)
        except Exception as e:
            rows.append({'source_id': sid, 'base_url': base, 'error': str(e), 'link': None})
            continue

        for href in HREF.findall(html):
            full = urljoin(base, href)
            if not full.startswith('http'):
                continue
            if not KEEP.search(full):
                continue
            if any(x in full.lower() for x in ['#', 'linkedin.com', '.pdf', '/kontakt', '/impressum']):
                continue
            k = (sid, full)
            if k in seen:
                continue
            seen.add(k)
            rows.append({'source_id': sid, 'base_url': base, 'link': full})

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    print(f'wrote {len(rows)} police-focused links -> {OUT}')


if __name__ == '__main__':
    main()
