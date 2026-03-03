#!/usr/bin/env python3
import hashlib
import json
import os
import urllib.request
from datetime import datetime, timezone

import psycopg
from dotenv import load_dotenv

SOURCE_KEY = "ch-zh-gemeinderat-api"
API_URL = "https://www.gemeinderat-zuerich.ch/format/module/politik_axioma/geschaefte/geschaefte_data_server.php?search=done&page=1"


def main():
    load_dotenv('.env')
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise SystemExit('DATABASE_URL fehlt in .env')

    limit = int(os.environ.get('TPM_ZH_LIMIT', '200'))

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute("select id from politics_monitor.pm_sources where source_key=%s", (SOURCE_KEY,))
            row = cur.fetchone()
            if not row:
                raise SystemExit(f'Source {SOURCE_KEY} fehlt. Erst seed_sources.py ausführen.')
            source_id = row[0]

            cur.execute(
                "insert into politics_monitor.pm_runs (source_id,status,started_at) values (%s,'running',now()) returning id",
                (source_id,),
            )
            run_id = cur.fetchone()[0]

        try:
            raw = urllib.request.urlopen(API_URL, timeout=45).read().decode('utf-8', 'ignore')
            obj = json.loads(raw)
            data = obj.get('data', [])[:limit]
            fetched = len(data)
            inserted = updated = 0

            with conn.cursor() as cur:
                now = datetime.now(timezone.utc)
                for it in data:
                    attrs = it.get('@attributes') or {}
                    ext = str(attrs.get('OBJ_GUID') or attrs.get('SEQ') or '').strip()
                    if not ext:
                        continue

                    payload = json.dumps(it, ensure_ascii=False)
                    raw_hash = hashlib.sha256(payload.encode('utf-8')).hexdigest()

                    cur.execute(
                        """
                        insert into politics_monitor.pm_items_raw
                        (run_id, source_id, external_id, fetched_at, raw_payload, raw_hash)
                        values (%s,%s,%s,%s,%s::jsonb,%s)
                        """,
                        (run_id, source_id, ext, now, payload, raw_hash),
                    )

                    title = (it.get('Titel') or '').strip() or f'ZH Geschäft {ext}'
                    body_parts = []
                    for k in ['Geschaeftsart','Geschaeftsstatus','Erstunterzeichner','Mitunterzeichner','VorberatendeKommission','Traktanden']:
                        v = it.get(k)
                        if v:
                            body_parts.append(f"{k}: {v}")
                    body = "\n".join(body_parts) or None
                    persons = []
                    for key in ['Erstunterzeichner', 'Mitunterzeichner']:
                        v = (it.get(key) or '').strip()
                        if v:
                            persons.extend([p.strip() for p in v.replace(';', ',').split(',') if p.strip()])
                    persons = list(dict.fromkeys(persons))[:30] if persons else None
                    item_type = (it.get('Geschaeftsart') or '').strip() or None
                    status = (it.get('Geschaeftsstatus') or '').strip() or None
                    grnr = (it.get('GRNr') or '').strip()
                    source_url = f"https://www.gemeinderat-zuerich.ch/geschaefte/detail.php?gid={ext}"

                    cur.execute(
                        """
                        insert into politics_monitor.pm_items
                        (source_id, external_id, title, body, item_type, status, persons, canton, municipality, source_url, first_seen_at, last_seen_at, updated_at, language, review_status)
                        values (%s,%s,%s,%s,%s,%s,%s,'ZH','Zürich',%s,now(),now(),now(),'de','queued')
                        on conflict (source_id, external_id)
                        do update set
                          title = excluded.title,
                          body = excluded.body,
                          item_type = excluded.item_type,
                          status = excluded.status,
                          persons = excluded.persons,
                          canton = 'ZH',
                          municipality = 'Zürich',
                          source_url = excluded.source_url,
                          last_seen_at = now(),
                          updated_at = now(),
                          review_status = case when politics_monitor.pm_items.review_status='queued' then 'queued' else politics_monitor.pm_items.review_status end
                        """,
                        (source_id, ext, title, body, item_type, status, persons, source_url),
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
