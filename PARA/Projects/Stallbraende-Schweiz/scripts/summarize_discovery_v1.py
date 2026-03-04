#!/usr/bin/env python3
import json
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / 'data' / 'stallbraende' / 'links.discovered.v1.jsonl'
OUT = ROOT / 'data' / 'stallbraende' / 'discovery.summary.v1.json'

rows=[]
for line in INP.read_text(encoding='utf-8').splitlines():
    if line.strip():
        rows.append(json.loads(line))

by_source=Counter(r.get('source_id','(none)') for r in rows)
by_domain=Counter(r.get('domain','(none)') for r in rows)

payload={
    'total_links': len(rows),
    'by_source': dict(by_source.most_common()),
    'top_domains': dict(by_domain.most_common(20)),
}
OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'wrote summary -> {OUT}')
