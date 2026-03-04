#!/usr/bin/env python3
import json
import re
from pathlib import Path
from urllib.parse import urljoin
from urllib.request import Request, urlopen
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'stallbraende' / 'articles.police.lu.archive.firequeue.v1.jsonl'
BASE = 'https://polizei.lu.ch/dienstleistungen/medienmitteilungen/Archiv_Medienmitteilungen_2004_2015'

HREF_RE = re.compile(r'href=["\']([^"\']*Medienmitteilung_Details[^"\']*)["\']', re.I)
A_RE = re.compile(r'<a[^>]*href=["\']([^"\']*Medienmitteilung_Details[^"\']*)["\'][^>]*>(.*?)</a>', re.I | re.S)
TAG_RE = re.compile(r'<[^>]+>')
SPACE_RE = re.compile(r'\s+')

FIRE = re.compile(r'(brand|feuer|brennt|rauch|explosion)', re.I)


def fetch(url: str) -> str:
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 StallbraendeMonitor/0.7'})
    return urlopen(req, timeout=30).read().decode('utf-8', 'ignore')


def clean(t: str) -> str:
    return SPACE_RE.sub(' ', TAG_RE.sub(' ', t)).strip()


def extract_links(html: str):
    out = []
    for href, label_html in A_RE.findall(html):
        label = clean(label_html)
        out.append((href, label))
    if out:
        return out
    # fallback: href only
    return [(h, '') for h in HREF_RE.findall(html)]


def main():
    rows = []
    seen = set()
    now = datetime.now(timezone.utc).isoformat()

    for year in range(2004, 2016):
        for month in range(0, 13):
            q = '' if month == 0 else str(month)
            url = f'{BASE}?year={year}&month={q}&content='
            try:
                html = fetch(url)
            except Exception:
                continue

            for href, label in extract_links(html):
                full = urljoin(BASE, href)
                if full in seen:
                    continue
                seen.add(full)

                title = label.strip()
                if not FIRE.search(title):
                    continue

                rows.append({
                    'source_id': 'ch-lu-police-news',
                    'url': full,
                    'title': title,
                    'snippet': '',
                    'fetched_at': now,
                    'candidate_reason': 'lu_archive_fire_title_v1',
                    'needs_manual_triage': True,
                })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    print(f'LU archive firequeue rows: {len(rows)} -> {OUT}')
    for r in rows[:20]:
        print('-', r.get('title'))


if __name__ == '__main__':
    main()
