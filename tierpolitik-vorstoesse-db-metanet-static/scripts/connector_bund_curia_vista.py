#!/usr/bin/env python3
import hashlib
import json
import os
import urllib.parse
import urllib.request
from datetime import datetime, timezone

import psycopg
from dotenv import load_dotenv

SOURCE_KEY = "ch-bund-curia-vista"
DEFAULT_PAGE_SIZE = 200
DEFAULT_MAX_ROWS = 5000


def fetch_business_page(skip: int, top: int) -> list[dict]:
    params = {
        "$format": "json",
        "$top": str(top),
        "$skip": str(skip),
        "$orderby": "SubmissionDate desc",
        "$filter": "Language eq 'DE'",
    }
    query = urllib.parse.urlencode(params, safe=" $'=()")
    url = f"https://ws.parlament.ch/odata.svc/Business?{query}"
    with urllib.request.urlopen(url, timeout=30) as resp:
        payload = json.loads(resp.read().decode("utf-8", "ignore"))
    data = payload.get("d", [])
    if isinstance(data, list):
        return data
    if isinstance(data, dict):
        results = data.get("results", [])
        if isinstance(results, list):
            return results
    return []


def fetch_business(max_rows: int = DEFAULT_MAX_ROWS, page_size: int = DEFAULT_PAGE_SIZE) -> list[dict]:
    out: list[dict] = []
    skip = 0
    while len(out) < max_rows:
        top = min(page_size, max_rows - len(out))
        batch = fetch_business_page(skip=skip, top=top)
        if not batch:
            break
        out.extend(batch)
        if len(batch) < top:
            break
        skip += len(batch)
    return out


def parse_date(value: str | None):
    if not value:
        return None
    try:
        # OData format like /Date(1743465600000+0100)/
        if value.startswith("/Date("):
            ms = int(value.split("(", 1)[1].split("+", 1)[0].split("-", 1)[0].rstrip(")"))
            return datetime.fromtimestamp(ms / 1000, tz=timezone.utc).date()
        return datetime.fromisoformat(value[:10]).date()
    except Exception:
        return None


def main():
    load_dotenv(".env")
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL fehlt in .env")

    page_size = int(os.environ.get("TPM_CH_PAGE_SIZE", str(DEFAULT_PAGE_SIZE)))
    max_rows = int(os.environ.get("TPM_CH_MAX_ROWS", str(DEFAULT_MAX_ROWS)))

    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(
                "select id from politics_monitor.pm_sources where source_key = %s",
                (SOURCE_KEY,),
            )
            row = cur.fetchone()
            if not row:
                raise SystemExit(f"Source {SOURCE_KEY} nicht gefunden (Schritt 4 ausführen).")
            source_id = row[0]

            cur.execute(
                """
                insert into politics_monitor.pm_runs (source_id, status, started_at)
                values (%s, 'running', now())
                returning id
                """,
                (source_id,),
            )
            run_id = cur.fetchone()[0]

        try:
            items = fetch_business(max_rows=max_rows, page_size=page_size)
            fetched = len(items)
            inserted = 0
            updated = 0

            with conn.cursor() as cur:
                now = datetime.now(timezone.utc)
                for it in items:
                    external_id = str(it.get("ID") or "").strip()
                    if not external_id:
                        continue

                    raw_payload = json.dumps(it, ensure_ascii=False)
                    raw_hash = hashlib.sha256(raw_payload.encode("utf-8")).hexdigest()

                    cur.execute(
                        """
                        insert into politics_monitor.pm_items_raw
                        (run_id, source_id, external_id, fetched_at, raw_payload, raw_hash)
                        values (%s, %s, %s, %s, %s::jsonb, %s)
                        """,
                        (run_id, source_id, external_id, now, raw_payload, raw_hash),
                    )

                    title = (it.get("Title") or "").strip() or f"Business {external_id}"
                    body = (it.get("Description") or "").strip() or None
                    item_type = (it.get("BusinessTypeName") or "").strip() or None
                    status = (it.get("BusinessStatusText") or "").strip() or None
                    submitted_at = parse_date(it.get("SubmissionDate"))
                    source_url = f"https://www.parlament.ch/de/ratsbetrieb/suche-curia-vista/geschaeft?AffairId={external_id}"
                    submitted_by = (it.get("SubmittedBy") or "").strip()
                    persons = [p.strip() for p in submitted_by.replace(";", ",").split(",") if p.strip()]
                    persons = persons[:20] if persons else None

                    cur.execute(
                        """
                        insert into politics_monitor.pm_items
                        (source_id, external_id, title, body, item_type, status, submitted_at, persons, source_url, first_seen_at, last_seen_at, updated_at, language)
                        values (%s, %s, %s, %s, %s, %s, %s, %s, %s, now(), now(), now(), 'de')
                        on conflict (source_id, external_id)
                        do update set
                          title = excluded.title,
                          body = excluded.body,
                          item_type = excluded.item_type,
                          status = excluded.status,
                          submitted_at = excluded.submitted_at,
                          persons = excluded.persons,
                          source_url = excluded.source_url,
                          last_seen_at = now(),
                          updated_at = now()
                        """,
                        (source_id, external_id, title, body, item_type, status, submitted_at, persons, source_url),
                    )
                    if cur.rowcount == 1:
                        inserted += 1
                    else:
                        updated += 1

                cur.execute(
                    """
                    update politics_monitor.pm_runs
                    set status='ok',
                        finished_at=now(),
                        items_fetched=%s,
                        items_inserted=%s,
                        items_updated=%s,
                        items_failed=0
                    where id=%s
                    """,
                    (fetched, inserted, updated, run_id),
                )

            conn.commit()
            print(f"run_id={run_id} ok fetched={fetched} inserted={inserted} updated={updated}")

        except Exception as e:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    update politics_monitor.pm_runs
                    set status='error', finished_at=now(), error_message=%s
                    where id=%s
                    """,
                    (str(e)[:2000], run_id),
                )
            conn.commit()
            raise


if __name__ == "__main__":
    main()
