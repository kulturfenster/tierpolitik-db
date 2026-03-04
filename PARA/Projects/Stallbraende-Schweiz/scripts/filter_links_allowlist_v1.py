#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / 'data' / 'stallbraende' / 'links.prioritized.v1.jsonl'
OUT = ROOT / 'data' / 'stallbraende' / 'links.filtered.v1.jsonl'

# Domain/source specific allowlist patterns to suppress nav/anchor/search noise
ALLOW = {
    'ch-srf-search': ['/news/', '/story/'],
    'ch-20min-search': ['/story/', '/schweiz/', '/news/'],
    'ch-nzz-search': ['/schweiz/', '/international/', '/panorama/'],
    'ch-swissfire': ['/news', '/aktuell', '/medien'],
    'ch-be-police-news': ['/medien', '/mitteilung', '/news'],
    'ch-zh-police-news': ['/medien', '/mitteilung', '/news'],
    'ch-lu-police-news': ['/medien', '/mitteilung', '/news'],
    'ch-ag-police-news': ['/medien', '/mitteilung', '/news'],
}

BLOCK_CONTAINS = ['#', 'newsletter', '/suche', '/search', 'radio', 'podcast', 'shop.', 'abo.']

rows=[]
for line in INP.read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    r=json.loads(line)
    link=(r.get('link') or '').lower()
    sid=r.get('source_id') or ''
    if not link:
        continue
    if any(b in link for b in BLOCK_CONTAINS):
        continue

    allow = ALLOW.get(sid)
    if allow and not any(a in link for a in allow):
        continue

    rows.append(r)

with OUT.open('w', encoding='utf-8') as f:
    for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')

print(f'wrote {len(rows)} filtered links -> {OUT}')
print('top10:')
for r in rows[:10]:
    print(r.get('priority_score'), r.get('source_id'), r.get('link'))
