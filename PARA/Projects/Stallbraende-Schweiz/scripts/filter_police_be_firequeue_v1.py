#!/usr/bin/env python3
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / 'data' / 'stallbraende' / 'articles.police.be.firequeue.v1.jsonl'
OUT = ROOT / 'data' / 'stallbraende' / 'articles.police.be.firequeue.filtered.v1.jsonl'

# keep: hints for stall/agricultural context
KEEP = re.compile(
    r'(stall|scheune|landwirtschaft|bauernhof|oekonomiegebaeude|ökonomiegebäude|tierstall|tierhaltung|heu|heustock|miststock|pferd|rind|schwein|huhn|geflügel)',
    re.I,
)

# drop: common non-stall incident contexts
DROP = re.compile(
    r'(mehrfamilienhaus|wohnhaus|wohnung|dachwohnung|auto|motorrad|lastwagen|lieferwagen|kollision|frontalkollision|selbstunfall|unfall|kutschenunfall|einbrecher|gef[aä]ngnis|zeugenaufruf)',
    re.I,
)
FIRE = re.compile(r'(brand|feuer|brennt|rauch|explosion)', re.I)


def main():
    rows = []
    for line in INP.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        r = json.loads(line)
        title = (r.get('title') or '').strip()
        snippet = (r.get('snippet') or '').strip()
        hay = f'{title} {snippet}'

        if DROP.search(hay):
            continue
        if not FIRE.search(hay):
            continue
        if not KEEP.search(hay):
            continue

        r['candidate_reason'] = 'be_firequeue_filtered_v1'
        rows.append(r)

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    print(f'input rows: {sum(1 for _ in INP.open(encoding="utf-8") if _.strip())}')
    print(f'filtered rows: {len(rows)} -> {OUT}')
    for r in rows[:20]:
        print('-', r.get('title'))


if __name__ == '__main__':
    main()
