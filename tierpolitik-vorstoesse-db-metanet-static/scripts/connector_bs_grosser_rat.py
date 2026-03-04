#!/usr/bin/env python3
import hashlib
import os
import re
import json
from datetime import datetime, timezone
from urllib.request import urlopen

import psycopg
from dotenv import load_dotenv

SOURCE_KEY = 'ch-bs-grosser-rat-neu'
URL = 'https://www.grosserrat.bs.ch/ratsbetrieb/neue-vorstoesse'


def parse_items(html: str):
    # pattern: [26.5025](/ratsbetrieb/geschaefte/200114321) <text title>
    pattern = re.compile(r'\[(\d{2}\.\d{4})\]\((/ratsbetrieb/geschaefte/\d+)\)\s*\n\s*([^\n]+)', re.M)
    out = []
    for m in pattern.finditer(html):
        nr, rel, title = m.group(1), m.group(2), m.group(3).strip()
        url = f"https://www.grosserrat.bs.ch{rel}"
        # rough submitter extraction: first words after type until 'betreffend'
        submitter = None
        mm = re.search(r'(?:Anzug|Motion|Interpellation(?:\s+Nr\.\s*\d+)?|Schriftliche Anfrage|Budgetpostulat(?:\s+\d{4})?)\s+(.+?)\s+betreffend', title, re.I)
        if mm:
            submitter = mm.group(1).strip()
        out.append({'nr': nr, 'external_id': rel.split('/')[-1], 'title': title, 'url': url, 'submitter': submitter})
    return out


def main():
    load_dotenv('.env')
    db = os.environ.get('DATABASE_URL')
    if not db:
        raise SystemExit('DATABASE_URL fehlt in .env')

    html = urlopen(URL, timeout=60).read().decode('utf-8', 'ignore')
    items = parse_items(html)

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
                for it in items:
                    fetched += 1
                    ext = it['external_id']
                    persons = [it['submitter']] if it.get('submitter') else None
                    body = f"Geschäftsnummer: {it['nr']}"

                    raw_payload = str(it)
                    raw_hash = hashlib.sha256(raw_payload.encode('utf-8')).hexdigest()
                    cur.execute(
                        """
                        insert into politics_monitor.pm_items_raw
                        (run_id, source_id, external_id, fetched_at, raw_payload, raw_hash)
                        values (%s,%s,%s,%s,%s::jsonb,%s)
                        """,
                        (run_id, source_id, ext, now, json.dumps(it, ensure_ascii=False), raw_hash),
                    )

                    cur.execute(
                        """
                        insert into politics_monitor.pm_items
                        (source_id, external_id, title, body, item_type, status, persons, canton, source_url, first_seen_at, last_seen_at, updated_at, language)
                        values (%s,%s,%s,%s,'Vorstoss','eingereicht',%s,'BS',%s,now(),now(),now(),'de')
                        on conflict (source_id, external_id)
                        do update set
                          title=excluded.title,
                          body=excluded.body,
                          item_type=excluded.item_type,
                          status=excluded.status,
                          persons=excluded.persons,
                          canton='BS',
                          source_url=excluded.source_url,
                          last_seen_at=now(),
                          updated_at=now()
                        """,
                        (source_id, ext, it['title'], body, persons, it['url']),
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
