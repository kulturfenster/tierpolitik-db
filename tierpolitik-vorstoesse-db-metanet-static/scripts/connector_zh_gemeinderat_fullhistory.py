#!/usr/bin/env python3
import hashlib
import os
import json
import xml.etree.ElementTree as ET
from datetime import datetime, timezone
from urllib.parse import urlencode
from urllib.request import urlopen

import psycopg
from dotenv import load_dotenv

SOURCE_KEY = "ch-zh-gemeinderat-api"
BASE = "https://www.gemeinderat-zuerich.ch/api/geschaeft/searchdetails"


def local(tag: str) -> str:
    return tag.rsplit('}', 1)[-1]


def first_text(el, name: str):
    for c in list(el):
        if local(c.tag) == name:
            return (c.text or '').strip() or None
    return None


def main():
    load_dotenv('.env')
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise SystemExit('DATABASE_URL fehlt in .env')

    page_size = int(os.environ.get('TPM_ZH_PAGE_SIZE', '500'))
    max_hits = int(os.environ.get('TPM_ZH_MAX_HITS', '16000'))
    min_year = int(os.environ.get('TPM_ZH_MIN_YEAR', '2020'))

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
            fetched = inserted = updated = kept = 0
            start = 1
            now = datetime.now(timezone.utc)

            while start <= max_hits:
                q = urlencode({'q': 'seq>0', 'l': 'de-CH', 's': start, 'm': page_size})
                url = f"{BASE}?{q}"
                raw = urlopen(url, timeout=90).read()
                root = ET.fromstring(raw)
                hits = [h for h in root if local(h.tag) == 'Hit']
                if not hits:
                    break

                with conn.cursor() as cur:
                    for hit in hits:
                        g = None
                        for child in list(hit):
                            if local(child.tag) == 'Geschaeft':
                                g = child
                                break
                        if g is None:
                            continue

                        grnr = first_text(g, 'GRNr') or ''
                        try:
                            year = int(grnr.split('/')[0])
                        except Exception:
                            year = None
                        if year is None or year < min_year:
                            continue

                        fetched += 1

                        ext = g.attrib.get('OBJ_GUID') or hit.attrib.get('Guid') or ''
                        ext = str(ext).strip()
                        if not ext:
                            continue

                        title = first_text(g, 'Titel') or f'ZH Geschäft {ext}'
                        item_type = first_text(g, 'Geschaeftsart')
                        status = first_text(g, 'Geschaeftsstatus')
                        begin = first_text(g, 'Beginn')
                        submitted_at = None
                        if begin and len(begin) >= 10:
                            try:
                                submitted_at = datetime.fromisoformat(begin[:10]).date()
                            except Exception:
                                submitted_at = None
                        if submitted_at is None and year is not None:
                            # fallback: use GRNr year to preserve historical depth in metrics
                            submitted_at = datetime(year, 1, 1).date()

                        body_parts = []
                        for n in ['Geschaeftsart', 'Geschaeftsstatus', 'Erstunterzeichner', 'Mitunterzeichner', 'VorberatendeKommission', 'Traktanden']:
                            v = first_text(g, n)
                            if v:
                                body_parts.append(f"{n}: {v}")
                        body = '\n'.join(body_parts) or None

                        persons = []
                        for key in ['Erstunterzeichner', 'Mitunterzeichner']:
                            v = (first_text(g, key) or '').strip()
                            if v:
                                persons.extend([p.strip() for p in v.replace(';', ',').split(',') if p.strip()])
                        persons = list(dict.fromkeys(persons))[:30] if persons else None

                        source_url = f"https://www.gemeinderat-zuerich.ch/geschaefte/detail.php?gid={ext}"
                        xml_payload = ET.tostring(g, encoding='unicode')
                        raw_hash = hashlib.sha256(xml_payload.encode('utf-8')).hexdigest()

                        cur.execute(
                            """
                            insert into politics_monitor.pm_items_raw
                            (run_id, source_id, external_id, fetched_at, raw_payload, raw_hash)
                            values (%s,%s,%s,%s,%s::jsonb,%s)
                            """,
                            (run_id, source_id, ext, now, json.dumps({'xml': xml_payload}, ensure_ascii=False), raw_hash),
                        )

                        cur.execute(
                            """
                            insert into politics_monitor.pm_items
                            (source_id, external_id, title, body, item_type, status, submitted_at, persons, canton, municipality, source_url, first_seen_at, last_seen_at, updated_at, language)
                            values (%s,%s,%s,%s,%s,%s,%s,%s,'ZH','Zürich',%s,now(),now(),now(),'de')
                            on conflict (source_id, external_id)
                            do update set
                              title = excluded.title,
                              body = excluded.body,
                              item_type = excluded.item_type,
                              status = excluded.status,
                              submitted_at = excluded.submitted_at,
                              persons = excluded.persons,
                              canton = 'ZH', municipality = 'Zürich',
                              source_url = excluded.source_url,
                              last_seen_at = now(),
                              updated_at = now()
                            """,
                            (source_id, ext, title, body, item_type, status, submitted_at, persons, source_url),
                        )
                        if cur.rowcount == 1:
                            inserted += 1
                        else:
                            updated += 1
                        kept += 1

                conn.commit()
                start += page_size

            with conn.cursor() as cur:
                cur.execute(
                    "update politics_monitor.pm_runs set status='ok', finished_at=now(), items_fetched=%s, items_inserted=%s, items_updated=%s, items_failed=0 where id=%s",
                    (kept, inserted, updated, run_id),
                )
            conn.commit()
            print(f'run_id={run_id} ok kept={kept} inserted={inserted} updated={updated}')

        except Exception as e:
            with conn.cursor() as cur:
                cur.execute("update politics_monitor.pm_runs set status='error', finished_at=now(), error_message=%s where id=%s", (str(e)[:2000], run_id))
            conn.commit()
            raise


if __name__ == '__main__':
    main()
