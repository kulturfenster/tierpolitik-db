#!/usr/bin/env python3
import json
import re
from urllib.parse import urljoin, urlparse
from urllib.request import Request, urlopen
from pathlib import Path
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / 'data' / 'stallbraende' / 'sources.v0.json'
OUT = ROOT / 'data' / 'stallbraende' / 'links.discovered.v1.jsonl'

LINK_RE = re.compile(r'href=["\']([^"\']+)["\']', re.I)


def fetch(url: str) -> str:
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 StallbraendeMonitor/0.2'})
    return urlopen(req, timeout=30).read().decode('utf-8', 'ignore')


def main():
    sources = json.loads(SRC.read_text(encoding='utf-8'))
    now = datetime.now(timezone.utc).isoformat()
    seen = set()
    rows = []

    for s in sources:
        url = s['url']
        try:
            html = fetch(url)
        except Exception as e:
            rows.append({'source_id': s['id'], 'source_url': url, 'fetched_at': now, 'error': str(e), 'link': None})
            continue

        for href in LINK_RE.findall(html):
            full = urljoin(url, href)
            if not full.startswith('http'):
                continue
            # skip obvious static assets
            if re.search(r'\.(css|js|png|jpg|jpeg|svg|ico|woff2?)($|\?)', full, re.I):
                continue
            key = (s['id'], full)
            if key in seen:
                continue
            seen.add(key)
            rows.append({
                'source_id': s['id'],
                'source_url': url,
                'fetched_at': now,
                'link': full,
                'domain': urlparse(full).netloc,
            })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    print(f'wrote {len(rows)} discovered links -> {OUT}')


if __name__ == '__main__':
    main()
