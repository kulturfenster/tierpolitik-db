#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / 'data' / 'stallbraende' / 'articles.extracted.v1.jsonl'
OUT = ROOT / 'data' / 'stallbraende' / 'articles.filtered.v1.jsonl'

POS = re.compile(r'(stallbrand|stall\s*vollbrand|stallfeuer|stall\s+brennt|huehnerstall|hühnerstall|schweinestall|rinderstall|kuhstall|masthühner|masthuehner|legehennen|ferkel|kaelber|kälber|bauernhof.*brand|brand.*stall)', re.I)
NEG = re.compile(r'(bar\s+.*vollbrand|flugzeugtraeger|iran-krieg|ukraine-krieg)', re.I)

rows=[]
for line in INP.read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    r=json.loads(line)
    txt=' '.join([r.get('url') or '', r.get('title') or ''])
    if NEG.search(txt):
        continue
    if not POS.search(txt):
        continue
    rows.append(r)

with OUT.open('w',encoding='utf-8') as f:
    for r in rows:
        f.write(json.dumps(r,ensure_ascii=False)+'\n')

print(f'wrote {len(rows)} filtered candidates -> {OUT}')
for r in rows[:20]:
    print('-', r.get('url'))
