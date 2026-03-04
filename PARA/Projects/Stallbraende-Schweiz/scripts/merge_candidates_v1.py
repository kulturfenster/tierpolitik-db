#!/usr/bin/env python3
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
IN_FILES = [
    ROOT / 'data' / 'stallbraende' / 'articles.filtered.v1.jsonl',
    ROOT / 'data' / 'stallbraende' / 'articles.police.v1.jsonl',
    ROOT / 'data' / 'stallbraende' / 'articles.police.zh.rss.v1.jsonl',
]
OUT = ROOT / 'data' / 'stallbraende' / 'articles.merged.v1.jsonl'

seen=set()
rows=[]
for f in IN_FILES:
    if not f.exists():
        continue
    for line in f.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        r=json.loads(line)
        u=((r.get('url') or r.get('link') or '')).strip()
        if not u or u in seen:
            continue
        seen.add(u)
        r['url'] = u
        r['merged_from']=f.name
        rows.append(r)

with OUT.open('w',encoding='utf-8') as fp:
    for r in rows:
        fp.write(json.dumps(r,ensure_ascii=False)+'\n')

print(f'wrote {len(rows)} merged candidates -> {OUT}')
