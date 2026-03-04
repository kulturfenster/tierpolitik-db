#!/usr/bin/env python3
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
INP = ROOT / 'data' / 'stallbraende' / 'links.filtered.v1.jsonl'
OUT = ROOT / 'data' / 'stallbraende' / 'articles.extracted.v1.jsonl'

URL_HINT = re.compile(r'(medien|news|aktuell|mitteilung|meldung|polizei|ratsbetrieb|geschaeft)', re.I)
KEYWORD = re.compile(r'(stallbrand|stall\s*brand|brand in .*stall|stall brannte|brand eines stalles|gefluegelstall|huehnerstall|hühnerstall|schweinestall|rinderstall|kuhstall|viehstall|scheunenbrand)', re.I)
TITLE_RE = re.compile(r'<title[^>]*>(.*?)</title>', re.I | re.S)


def fetch(url: str) -> str:
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 StallbraendeMonitor/0.3'})
    return urlopen(req, timeout=20).read().decode('utf-8', 'ignore')


def clean_text(html: str) -> str:
    html = re.sub(r'<script[\s\S]*?</script>', ' ', html, flags=re.I)
    html = re.sub(r'<style[\s\S]*?</style>', ' ', html, flags=re.I)
    txt = re.sub(r'<[^>]+>', ' ', html)
    txt = re.sub(r'\s+', ' ', txt).strip()
    return txt


def main():
    rows=[]
    now=datetime.now(timezone.utc).isoformat()
    links=[]
    for line in INP.read_text(encoding='utf-8').splitlines():
        if not line.strip():
            continue
        rec=json.loads(line)
        link=rec.get('link')
        if not link:
            continue
        if not URL_HINT.search(link):
            continue
        links.append(rec)

    # cap to keep heartbeat runtime stable
    links=links[:300]

    for rec in links:
        url=rec['link']
        try:
            html=fetch(url)
        except Exception as e:
            rows.append({'url':url,'source_id':rec.get('source_id'),'fetched_at':now,'error':str(e)})
            continue
        title_m=TITLE_RE.search(html)
        title=re.sub(r'\s+',' ',title_m.group(1)).strip() if title_m else None
        txt=clean_text(html)
        hit=bool(KEYWORD.search((title or '')+' '+txt))
        if not hit:
            continue
        rows.append({
            'url': url,
            'source_id': rec.get('source_id'),
            'fetched_at': now,
            'title': title,
            'snippet': txt[:800],
            'candidate_reason': 'article_keyword_match_v1'
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w',encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r,ensure_ascii=False)+'\n')

    print(f'wrote {len(rows)} article candidates -> {OUT}')


if __name__ == '__main__':
    main()
