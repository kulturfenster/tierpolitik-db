#!/usr/bin/env python3
import json,re
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
RAW=ROOT/'data'/'stallbraende'/'events.raw.v0.jsonl'
OUT=ROOT/'data'/'stallbraende'/'events.candidates.v0.jsonl'

PAT=re.compile(r'(stallbrand|stall brennt|brand in einem stall|gefluegelstall|huehnerstall|schweinestall|rinderstall)',re.I)

rows=[]
for line in RAW.read_text(encoding='utf-8').splitlines():
    if not line.strip():
        continue
    r=json.loads(line)
    txt=' '.join([r.get('title') or '', r.get('snippet') or ''])
    if PAT.search(txt):
        r['candidate_reason']='keyword_match'
        rows.append(r)

OUT.parent.mkdir(parents=True,exist_ok=True)
with OUT.open('w',encoding='utf-8') as f:
    for r in rows:
        f.write(json.dumps(r,ensure_ascii=False)+'\n')

print(f'wrote {len(rows)} candidates -> {OUT}')
