#!/usr/bin/env python3
import hashlib
import json
import os
import re
from datetime import datetime, timezone
from html import unescape
from http.cookiejar import CookieJar
from urllib.parse import urlencode, urljoin
from urllib.request import HTTPCookieProcessor, Request, build_opener

import psycopg
from dotenv import load_dotenv

SOURCE_KEY = 'ch-ag-grosser-rat'
START_URL = 'https://www.ag.ch/grossrat/grweb/de/172/Gesch%C3%A4fte?ResetBreadCrumbs=T&ResetFilter=T'

ROW_RE = re.compile(r'<tr[^>]*>(.*?)</tr>', re.I | re.S)
PROZ_RE = re.compile(r'Detail%20Gesch%C3%A4ft\?ProzId=(\d+)', re.I)
NUM_RE = re.compile(r'>(\d{2}\.\d+)<' )
TAG_RE = re.compile(r'<[^>]+>')
SPACE_RE = re.compile(r'\s+')
OFFSET_RE = re.compile(r'Offset=(\d+)', re.I)
PAGE_RE = re.compile(r'Seite\s+(\d+)\s+von\s+(\d+)', re.I)
DATE_RE = re.compile(r'vom\s+(\d{1,2}\.\s*[A-Za-zäöüÄÖÜ]+\s*\d{4}|\d{1,2}\.\d{1,2}\.\d{4})', re.I)


def clean_html(s: str) -> str:
    return SPACE_RE.sub(' ', unescape(TAG_RE.sub(' ', s))).strip()


def parse_rows(html: str):
    out = []
    for row_html in ROW_RE.findall(html):
        m = PROZ_RE.search(row_html)
        if not m:
            continue
        proz_id = m.group(1)
        num_m = NUM_RE.search(row_html)
        num = num_m.group(1) if num_m else None

        cells = re.findall(r'<td[^>]*>(.*?)</td>', row_html, re.I | re.S)
        dep = clean_html(cells[1]) if len(cells) > 1 else None
        title = clean_html(cells[2]) if len(cells) > 2 else clean_html(row_html)
        if len(title) < 8:
            continue

        out.append({
            'external_id': proz_id,
            'geschaeft_nr': num,
            'department': dep,
            'title': title,
            'url': f'https://www.ag.ch/grossrat/grweb/de/195/Detail%20Gesch%C3%A4ft?ProzId={proz_id}',
        })
    return out


def try_parse_date_from_title(title: str):
    m = DATE_RE.search(title or '')
    if not m:
        return None
    raw = m.group(1).strip()
    try:
        if re.match(r'\d{1,2}\.\d{1,2}\.\d{4}$', raw):
            return datetime.strptime(raw, '%d.%m.%Y').date()
    except Exception:
        return None
    return None


def bootstrap_search(opener):
    html = opener.open(Request(START_URL, headers={'User-Agent': 'Mozilla/5.0'}), timeout=90).read().decode('utf-8', 'ignore')
    form_m = re.search(r'<form[^>]+id="C_PROZ_SEARCH-[^"]+"[^>]+action="([^"]+)"', html, re.I)
    if not form_m:
        raise RuntimeError('AG search form not found')
    action = form_m.group(1).replace('&amp;', '&')
    post_url = urljoin(START_URL, action)

    fields = {
        'Stichworte': '',
        'ProzNr': '',
        'Haengig': 'F',
        'FristAbgelaufen': 'F',
        'ProzArt': 'Verstoesse',
        'ProzCd': '',
        'EingangDat[0]': '',
        'EingangDat[1]': '',
        'ErlDat[0]': '',
        'ErlDat[1]': '',
        'Search': 'Suchen',
    }
    req = Request(post_url, data=urlencode(fields).encode(), headers={'User-Agent': 'Mozilla/5.0', 'Content-Type': 'application/x-www-form-urlencoded'})
    res = opener.open(req, timeout=90)
    result_html = res.read().decode('utf-8', 'ignore')
    return res.geturl(), result_html


def main():
    load_dotenv('.env')
    db = os.environ.get('DATABASE_URL')
    if not db:
        raise SystemExit('DATABASE_URL fehlt in .env')

    max_rows = int(os.environ.get('TPM_AG_MAX_ROWS', '1500'))
    max_pages = int(os.environ.get('TPM_AG_MAX_PAGES', '40'))
    page_size = 25

    opener = build_opener(HTTPCookieProcessor(CookieJar()))
    base_result_url, html = bootstrap_search(opener)

    rows = []
    seen = set()

    def ingest(page_html):
        for r in parse_rows(page_html):
            ext = r['external_id']
            if ext in seen:
                continue
            seen.add(ext)
            rows.append(r)

    ingest(html)

    page_m = PAGE_RE.search(html)
    if page_m:
        total_pages = int(page_m.group(2))
        offsets = [i * page_size for i in range(1, total_pages)]
    else:
        offsets = sorted({int(x) for x in OFFSET_RE.findall(html)})

    limit_links = re.findall(r'href="([^"]*FrmRequest=LimitList[^"]*Offset=\d+[^"]*)"', html, re.I)
    limit_base = None
    if limit_links:
        limit_base = unescape(limit_links[0])

    pages_done = 1
    for off in offsets:
        if len(rows) >= max_rows:
            break
        if pages_done >= max_pages:
            break

        if limit_base:
            page_url = re.sub(r'Offset=\d+', f'Offset={off}', limit_base)
        else:
            page_url = re.sub(r'Offset=\d+', f'Offset={off}', base_result_url) if 'Offset=' in base_result_url else (base_result_url + f'&Offset={off}')

        try:
            h = opener.open(Request(page_url, headers={'User-Agent': 'Mozilla/5.0'}), timeout=90).read().decode('utf-8', 'ignore')
        except Exception:
            continue
        before = len(rows)
        ingest(h)
        pages_done += 1
        if len(rows) == before:
            # no new items -> likely end or blocked
            continue

    rows = rows[:max_rows]

    with psycopg.connect(db) as conn:
        with conn.cursor() as cur:
            cur.execute('select id from politics_monitor.pm_sources where source_key=%s', (SOURCE_KEY,))
            row = cur.fetchone()
            if not row:
                raise SystemExit(f'Source {SOURCE_KEY} fehlt; zuerst seed_sources.py ausführen')
            source_id = row[0]

            cur.execute("insert into politics_monitor.pm_runs (source_id,status,started_at) values (%s,'running',now()) returning id", (source_id,))
            run_id = cur.fetchone()[0]

        fetched = inserted = updated = 0
        now = datetime.now(timezone.utc)

        try:
            with conn.cursor() as cur:
                for it in rows:
                    fetched += 1
                    ext = it['external_id']
                    submitted_at = try_parse_date_from_title(it.get('title'))
                    body_bits = []
                    if it.get('geschaeft_nr'):
                        body_bits.append(f"Geschäftsnummer: {it['geschaeft_nr']}")
                    if it.get('department'):
                        body_bits.append(f"Departement: {it['department']}")
                    body = '\n'.join(body_bits) if body_bits else None

                    raw_payload = json.dumps(it, ensure_ascii=False)
                    raw_hash = hashlib.sha256(raw_payload.encode('utf-8')).hexdigest()
                    cur.execute(
                        """
                        insert into politics_monitor.pm_items_raw
                        (run_id, source_id, external_id, fetched_at, raw_payload, raw_hash)
                        values (%s,%s,%s,%s,%s::jsonb,%s)
                        """,
                        (run_id, source_id, ext, now, raw_payload, raw_hash),
                    )

                    cur.execute(
                        """
                        insert into politics_monitor.pm_items
                        (source_id, external_id, title, body, item_type, status, submitted_at, canton, source_url, first_seen_at, last_seen_at, updated_at, language)
                        values (%s,%s,%s,%s,'Vorstoss',null,%s,'AG',%s,now(),now(),now(),'de')
                        on conflict (source_id, external_id)
                        do update set
                          title=excluded.title,
                          body=excluded.body,
                          item_type=excluded.item_type,
                          status=excluded.status,
                          submitted_at=coalesce(excluded.submitted_at, politics_monitor.pm_items.submitted_at),
                          canton='AG',
                          source_url=excluded.source_url,
                          last_seen_at=now(),
                          updated_at=now()
                        """,
                        (source_id, ext, it['title'], body, submitted_at, it['url']),
                    )
                    if cur.rowcount == 1:
                        inserted += 1
                    else:
                        updated += 1

                cur.execute(
                    "update politics_monitor.pm_runs set status='ok', finished_at=now(), items_fetched=%s, items_inserted=%s, items_updated=%s, items_failed=0 where id=%s",
                    (fetched, inserted, updated, run_id),
                )
            conn.commit()
            print(f'run_id={run_id} ok fetched={fetched} inserted={inserted} updated={updated}')
        except Exception as e:
            with conn.cursor() as cur:
                cur.execute("update politics_monitor.pm_runs set status='error', finished_at=now(), error_message=%s where id=%s", (str(e)[:2000], run_id))
            conn.commit()
            raise


if __name__ == '__main__':
    main()
