#!/usr/bin/env python3
import json
import re
from pathlib import Path
from urllib.request import Request, urlopen
from xml.etree import ElementTree as ET
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'data' / 'stallbraende' / 'articles.police.be.newsid.v1.jsonl'
SITEMAP = 'https://www.police.be.ch/sitemap.xml'

FIRE = re.compile(r'(brand|feuer|brennt|rauch|explosion)', re.I)
FARM = re.compile(
    r'(stall|scheune|landwirtschaft|bauernhof|oekonomiegebaeude|ökonomiegebäude|tierstall|tierhaltung|heu|heustock|miststock)',
    re.I,
)
TITLE_RE = re.compile(r'<title[^>]*>(.*?)</title>', re.I | re.S)


def fetch_bytes(url: str) -> bytes:
    req = Request(url, headers={'User-Agent': 'Mozilla/5.0 StallbraendeMonitor/0.7'})
    return urlopen(req, timeout=30).read()


def fetch_text(url: str) -> str:
    return fetch_bytes(url).decode('utf-8', 'ignore')


def sitemap_urls(seed_url: str, max_urls: int = 5000):
    out = []
    queue = [seed_url]
    seen = set()

    while queue and len(out) < max_urls:
        cur = queue.pop(0)
        if cur in seen:
            continue
        seen.add(cur)

        try:
            raw = fetch_bytes(cur)
        except Exception:
            continue

        try:
            root = ET.fromstring(raw)
        except Exception:
            continue

        if root.tag.lower().endswith('sitemapindex'):
            for loc in root.findall('.//{*}loc'):
                if loc.text and loc.text.strip():
                    queue.append(loc.text.strip())
            continue

        for loc in root.findall('.//{*}loc'):
            if not loc.text:
                continue
            u = loc.text.strip()
            if u:
                out.append(u)
            if len(out) >= max_urls:
                break

    return out


def clean_text(html: str) -> str:
    txt = re.sub(r'<script[\s\S]*?</script>', ' ', html, flags=re.I)
    txt = re.sub(r'<style[\s\S]*?</style>', ' ', txt, flags=re.I)
    txt = re.sub(r'<[^>]+>', ' ', txt)
    return re.sub(r'\s+', ' ', txt).strip()


def main():
    urls = sitemap_urls(SITEMAP)
    news_urls = [u for u in urls if 'start.html?newsID=' in u]

    rows = []
    now = datetime.now(timezone.utc).isoformat()

    for u in news_urls:
        try:
            html = fetch_text(u)
        except Exception:
            continue

        tm = TITLE_RE.search(html)
        title = re.sub(r'\s+', ' ', tm.group(1)).strip() if tm else ''
        body = clean_text(html)

        hay = f'{title} {body[:5000]}'
        if not FIRE.search(hay):
            continue
        if not FARM.search(hay):
            continue

        rows.append(
            {
                'source_id': 'ch-be-police-news',
                'url': u,
                'title': title,
                'snippet': body[:900],
                'fetched_at': now,
                'candidate_reason': 'be_newsid_fire_farm_v1',
            }
        )

    OUT.parent.mkdir(parents=True, exist_ok=True)
    with OUT.open('w', encoding='utf-8') as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + '\n')

    print(f'newsID urls scanned: {len(news_urls)}')
    print(f'candidates written: {len(rows)} -> {OUT}')
    for r in rows[:20]:
        print('-', r.get('title'))
        print(' ', r.get('url'))


if __name__ == '__main__':
    main()
