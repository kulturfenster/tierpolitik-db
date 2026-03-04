#!/usr/bin/env python3
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from urllib.request import urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUT_LINKS = ROOT / 'data' / 'stallbraende' / 'links.police.zh.rss.v1.jsonl'
OUT_ART = ROOT / 'data' / 'stallbraende' / 'articles.police.zh.rss.v1.jsonl'
RSS_URL = 'https://www.stadt-zuerich.ch/content/web/de/aktuell/medienmitteilungen/jcr:content/mainparsys/teaser.rss'

KW = re.compile(r'(stallbrand|brand.*stall|huehnerstall|hühnerstall|schweinestall|rinderstall|kuhstall|viehstall|bauernhof.*brand|masthühner|masthuehner|ferkel|kälber|kaelber|legehennen)', re.I)


def main():
    raw = urlopen(RSS_URL, timeout=60).read().decode('utf-8', 'ignore')
    root = ET.fromstring(raw)
    now = datetime.now(timezone.utc).isoformat()

    items = []
    for item in root.findall('.//item'):
        title = (item.findtext('title') or '').strip()
        link = (item.findtext('link') or '').strip()
        desc = (item.findtext('description') or '').strip()
        pub = (item.findtext('pubDate') or '').strip()
        if not link:
            continue
        items.append({
            'source_id': 'ch-zh-police-news',
            'link': link,
            'url': link,
            'title': title,
            'description': desc,
            'pubDate': pub,
            'fetched_at': now,
        })

    OUT_LINKS.parent.mkdir(parents=True, exist_ok=True)
    with OUT_LINKS.open('w', encoding='utf-8') as f:
        for r in items:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    candidates = [r for r in items if KW.search((r.get('title') or '') + ' ' + (r.get('description') or ''))]
    with OUT_ART.open('w', encoding='utf-8') as f:
        for r in candidates:
            r2 = dict(r)
            r2['candidate_reason'] = 'zh_police_rss_keyword_v1'
            f.write(json.dumps(r2, ensure_ascii=False) + '\n')

    print(f'wrote {len(items)} rss items -> {OUT_LINKS}')
    print(f'wrote {len(candidates)} candidates -> {OUT_ART}')
    for r in candidates[:20]:
        print('-', r.get('title'))
        print(' ', r.get('link'))


if __name__ == '__main__':
    main()
