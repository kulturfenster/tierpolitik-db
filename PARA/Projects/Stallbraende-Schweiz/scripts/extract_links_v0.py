#!/usr/bin/env python3
"""Extract detail-link candidates from saved source snapshots (v0.2)."""
from __future__ import annotations

import json
import re
from pathlib import Path
from urllib.parse import urljoin, urlparse

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT / 'data' / 'stallbraende' / 'events.raw.v0.jsonl'
OUT = ROOT / 'data' / 'stallbraende' / 'links.raw.v0.jsonl'

HREF_RE = re.compile(r"href=[\"']([^\"']+)[\"']", re.I)
BAD_PREFIX = ('javascript:', 'mailto:', '#')
BAD_EXT = ('.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.pdf', '.zip')
KEY_HINT = re.compile(r'(brand|feuer|stall|hof|landwirtschaft|scheune)', re.I)


def normalize(base: str, href: str) -> str | None:
    h = href.strip()
    if not h or h.startswith(BAD_PREFIX):
        return None
    url = urljoin(base, h)
    u = urlparse(url)
    if u.scheme not in ('http', 'https'):
        return None
    if any(u.path.lower().endswith(ext) for ext in BAD_EXT):
        return None
    return url


rows: list[dict] = []
seen: set[tuple[str, str]] = set()
for line in RAW.read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    r = json.loads(line)
    base = r.get('source_url') or ''
    html_path = r.get('html_path')
    html = ''
    if html_path:
        p = ROOT / html_path
        if p.exists():
            html = p.read_text(encoding='utf-8', errors='ignore')

    for href in HREF_RE.findall(html):
        url = normalize(base, href)
        if not url:
            continue
        hint = f"{url} {href}"
        if not KEY_HINT.search(hint):
            continue
        key = (r.get('source_id') or '', url)
        if key in seen:
            continue
        seen.add(key)
        rows.append({
            'source_id': r.get('source_id'),
            'source_name': r.get('source_name'),
            'fetched_at': r.get('fetched_at'),
            'url': url,
            'origin': 'snapshot_href_keyword_hint',
        })

OUT.parent.mkdir(parents=True, exist_ok=True)
with OUT.open('w', encoding='utf-8') as f:
    for row in rows:
        f.write(json.dumps(row, ensure_ascii=False) + '\n')

print(f'wrote {len(rows)} links -> {OUT}')
