#!/usr/bin/env python3
import os
import re
from datetime import datetime
from urllib.request import Request, urlopen

import psycopg
from dotenv import load_dotenv

DATE_NUM = re.compile(r'\b(\d{1,2}\.\d{1,2}\.\d{4})\b')
DATE_DE = re.compile(r'\b(\d{1,2})\.\s*(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s*(\d{4})\b', re.I)
MONTHS = {
    'januar': 1, 'februar': 2, 'märz': 3, 'maerz': 3, 'april': 4, 'mai': 5, 'juni': 6,
    'juli': 7, 'august': 8, 'september': 9, 'oktober': 10, 'november': 11, 'dezember': 12,
}


def parse_date(text: str):
    m = DATE_NUM.search(text)
    if m:
        try:
            return datetime.strptime(m.group(1), '%d.%m.%Y').date()
        except Exception:
            pass
    m = DATE_DE.search(text)
    if m:
        d = int(m.group(1)); mon = MONTHS.get(m.group(2).lower()); y = int(m.group(3))
        if mon:
            try:
                return datetime(y, mon, d).date()
            except Exception:
                pass
    return None


def main():
    load_dotenv('.env')
    db = os.environ.get('DATABASE_URL')
    if not db:
        raise SystemExit('DATABASE_URL fehlt')

    ua = {'User-Agent': 'Mozilla/5.0 TierpolitikMonitor/1.0'}
    scanned = updated = failed = 0

    with psycopg.connect(db) as conn, conn.cursor() as cur:
        cur.execute("""
            select id, source_url
            from politics_monitor.pm_items
            where canton='AG' and submitted_at is null and source_url is not null
            limit 500
        """)
        rows = cur.fetchall()

        for item_id, url in rows:
            scanned += 1
            try:
                html = urlopen(Request(url, headers=ua), timeout=40).read().decode('utf-8', 'ignore')
            except Exception:
                failed += 1
                continue

            # reduce noise a bit
            txt = re.sub(r'<[^>]+>', ' ', html)
            txt = re.sub(r'\s+', ' ', txt)
            dt = parse_date(txt)
            if not dt:
                continue

            cur.execute("update politics_monitor.pm_items set submitted_at=%s, updated_at=now() where id=%s", (dt, item_id))
            updated += cur.rowcount

        conn.commit()

    print(f'scanned={scanned} updated={updated} failed_fetch={failed}')


if __name__ == '__main__':
    main()
