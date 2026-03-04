#!/usr/bin/env python3
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / 'data' / 'stallbraende' / 'links.police.v1.jsonl'
OUT = ROOT / 'data' / 'stallbraende' / 'articles.police.v1.jsonl'

KEYWORD = re.compile(
    r'(stallbrand|stall\s*brand|brand.*stall|huehnerstall|h\u00fchnerstall|schweinestall|rinderstall|kuhstall|viehstall|'
    r'scheunenbrand|brand.*scheune|oekonomiegebaeude|\xF6konomiegeb[aä]ude|landwirtschaftsbetrieb|landwirtschaftsgeb[aä]ude|'
    r'bauernhof.*brand|heustock|heu.*brand|miststock|tierstall|tierhaltung|'
    r'masth\u00fchner|masthuehner|ferkel|k\u00e4lber|kaelber|legehennen)',
    re.I,
)
TITLE_RE = re.compile(r'<title[^>]*>(.*?)</title>', re.I | re.S)


def fetch(url: str) -> str:
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 StallbraendeMonitor/0.5'})
    return urlopen(req, timeout=25).read().decode('utf-8', 'ignore')


def clean(html: str) -> str:
    html = re.sub(r'<script[\s\S]*?</script>', ' ', html, flags=re.I)
    html = re.sub(r'<style[\s\S]*?</style>', ' ', html, flags=re.I)
    txt = re.sub(r'<[^>]+>', ' ', html)
    return re.sub(r'\s+', ' ', txt).strip()


def main():
    links = [json.loads(l) for l in INP.read_text(encoding='utf-8').splitlines() if l.strip()]
    rows = []
    now = datetime.now(timezone.utc).isoformat()

    for rec in links:
      url = rec.get('link')
      if not url:
        continue
      try:
        html = fetch(url)
      except Exception as e:
        rows.append({'source_id': rec.get('source_id'), 'url': url, 'error': str(e), 'fetched_at': now})
        continue

      m = TITLE_RE.search(html)
      title = re.sub(r'\s+', ' ', m.group(1)).strip() if m else ''
      txt = clean(html)
      if not KEYWORD.search(title + ' ' + txt):
        continue

      rows.append({
        'source_id': rec.get('source_id'),
        'url': url,
        'title': title,
        'snippet': txt[:900],
        'fetched_at': now,
        'candidate_reason': 'police_keyword_match_v1',
      })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8') as f:
      for r in rows:
        f.write(json.dumps(r, ensure_ascii=False) + '\n')

    print(f'wrote {len(rows)} police article candidates -> {OUT}')
    for r in rows[:20]:
      print('-', r.get('source_id'), r.get('url'))


if __name__ == '__main__':
    main()
