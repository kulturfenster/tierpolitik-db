#!/usr/bin/env python3
import hashlib
import json
import os
from datetime import datetime, timezone
from urllib.request import urlopen

import psycopg
from dotenv import load_dotenv

SOURCE_KEY = 'ch-be-grosser-rat-ogd'
URL_GESCHAEFT = 'https://ogd.parl.apps.be.ch/data/geschaeft.json'


def parse_date(v: str | None):
    if not v:
        return None
    v = str(v).strip()
    # unix epoch ms as string (e.g. 1489964400000)
    if v.isdigit() and len(v) >= 12:
        try:
            return datetime.fromtimestamp(int(v) / 1000, tz=timezone.utc).date()
        except Exception:
            pass
    # fallback ISO
    try:
        return datetime.fromisoformat(v[:10]).date()
    except Exception:
        return None


def main():
    load_dotenv('.env')
    db = os.environ.get('DATABASE_URL')
    if not db:
        raise SystemExit('DATABASE_URL fehlt in .env')

    min_year = int(os.environ.get('TPM_BE_MIN_YEAR', '2020'))

    data = json.loads(urlopen(URL_GESCHAEFT, timeout=120).read().decode('utf-8', 'ignore')).get('data', [])

    with psycopg.connect(db) as conn:
        with conn.cursor() as cur:
            cur.execute("select id from politics_monitor.pm_sources where source_key=%s", (SOURCE_KEY,))
            row = cur.fetchone()
            if not row:
                raise SystemExit(f'Source {SOURCE_KEY} fehlt. Erst seed_sources.py ausführen.')
            source_id = row[0]

            cur.execute("insert into politics_monitor.pm_runs (source_id,status,started_at) values (%s,'running',now()) returning id", (source_id,))
            run_id = cur.fetchone()[0]

        fetched = inserted = updated = kept = 0
        try:
            with conn.cursor() as cur:
                now = datetime.now(timezone.utc)
                for it in data:
                    fetched += 1
                    ext = str(it.get('geschaeft_uid') or '').strip()
                    if not ext:
                        continue

                    submitted_at = parse_date(it.get('geschaeft_vorstoss_eingereicht_datum'))
                    year = submitted_at.year if submitted_at else None
                    if year is None or year < min_year:
                        continue

                    title = (it.get('geschaeft_titel_deutsch') or '').strip() or f"BE Geschäft {ext}"
                    item_type = (it.get('geschaeft_typ_deutsch') or '').strip() or None
                    status = (it.get('geschaeft_status_deutsch') or '').strip() or None
                    nr = (it.get('geschaeft_nr') or '').strip()
                    vorstoss_nr = (it.get('geschaeft_vorstoss_nummer') or '').strip()
                    main_submitter = ' '.join(filter(None, [
                        (it.get('geschaeft_vorstoss_hauptvorstoesser_vorname') or '').strip(),
                        (it.get('geschaeft_vorstoss_hauptvorstoesser_name') or '').strip(),
                    ])).strip()
                    mit = (it.get('geschaeft_vorstoss_mitvorstoesser_namen_liste') or '').strip()
                    persons = []
                    if main_submitter:
                        persons.append(main_submitter)
                    if mit:
                        persons.extend([p.strip() for p in mit.replace(';', ',').split(',') if p.strip()])
                    persons = list(dict.fromkeys(persons))[:40] if persons else None

                    body_parts = []
                    if nr:
                        body_parts.append(f"Geschäftsnummer: {nr}")
                    if vorstoss_nr:
                        body_parts.append(f"Vorstossnummer: {vorstoss_nr}")
                    if main_submitter:
                        body_parts.append(f"Hauptvorstösser: {main_submitter}")
                    if mit:
                        body_parts.append(f"Mitvorstösser: {mit}")
                    body = '\n'.join(body_parts) if body_parts else None

                    source_url = f"https://www.gr.be.ch/de/start/geschaefte/geschaeftssuche/geschaeftsdetail.html?guid={ext}"

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
                        (source_id, external_id, title, body, item_type, status, submitted_at, persons, canton, source_url, first_seen_at, last_seen_at, updated_at, language)
                        values (%s,%s,%s,%s,%s,%s,%s,%s,'BE',%s,now(),now(),now(),'de')
                        on conflict (source_id, external_id)
                        do update set
                          title=excluded.title,
                          body=excluded.body,
                          item_type=excluded.item_type,
                          status=excluded.status,
                          submitted_at=excluded.submitted_at,
                          persons=excluded.persons,
                          canton='BE',
                          source_url=excluded.source_url,
                          last_seen_at=now(),
                          updated_at=now()
                        """,
                        (source_id, ext, title, body, item_type, status, submitted_at, persons, source_url),
                    )
                    if cur.rowcount == 1:
                        inserted += 1
                    else:
                        updated += 1
                    kept += 1

                cur.execute(
                    "update politics_monitor.pm_runs set status='ok', finished_at=now(), items_fetched=%s, items_inserted=%s, items_updated=%s, items_failed=0 where id=%s",
                    (kept, inserted, updated, run_id),
                )
            conn.commit()
            print(f'run_id={run_id} ok fetched={fetched} kept={kept} inserted={inserted} updated={updated}')
        except Exception as e:
            with conn.cursor() as cur:
                cur.execute("update politics_monitor.pm_runs set status='error', finished_at=now(), error_message=%s where id=%s", (str(e)[:2000], run_id))
            conn.commit()
            raise


if __name__ == '__main__':
    main()
