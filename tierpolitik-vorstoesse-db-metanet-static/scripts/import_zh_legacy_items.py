#!/usr/bin/env python3
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
LEGACY = ROOT.parent / "projects" / "tierpolitik-db" / "data" / "crawler-v2-collect.json"
SOURCE_KEY = "ch-zh-legacy-import"


def pick_zh_items(items):
    out = []
    for it in items:
        blob = json.dumps(it, ensure_ascii=False).lower()
        if any(k in blob for k in ["gemeinderat-zuerich.ch", "kantonsrat.zh.ch", "zürich ·", "zh ·", " canton zh", "kanton zürich"]):
            out.append(it)
    return out


def main():
    load_dotenv(ROOT / ".env")
    db_url = os.environ.get("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL fehlt in .env")

    obj = json.loads(LEGACY.read_text(encoding="utf-8"))
    items = pick_zh_items(obj.get("items", []))

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            insert into politics_monitor.pm_sources
            (source_key, name, level, country, canton, parser_type, base_url, list_url, is_active, run_interval_minutes)
            values (%s,%s,'kanton','CH','ZH','html_list',%s,%s,true,1440)
            on conflict (source_key) do update set updated_at = now()
            returning id
            """,
            (
                SOURCE_KEY,
                "Kanton/Stadt Zürich – Legacy Import",
                "https://www.gemeinderat-zuerich.ch",
                "https://www.gemeinderat-zuerich.ch/geschaefte",
            ),
        )
        source_id = cur.fetchone()[0]

        ins = upd = 0
        for it in items:
            ext = str(it.get("externalId") or it.get("id") or "").strip()
            if not ext:
                continue
            title = (it.get("title") or "").strip() or f"ZH Item {ext}"
            body = (it.get("body") or it.get("summary") or "").strip() or None
            item_type = (it.get("type") or "Vorstoss").strip()
            status = (it.get("status") or "new").strip()
            source_url = it.get("sourceUrl") or it.get("url") or "https://www.gemeinderat-zuerich.ch/geschaefte"

            cur.execute(
                """
                insert into politics_monitor.pm_items
                (source_id, external_id, title, body, item_type, status, canton, source_url, first_seen_at, last_seen_at, updated_at, language, review_status)
                values (%s,%s,%s,%s,%s,%s,'ZH',%s,now(),now(),now(),'de','queued')
                on conflict (source_id, external_id)
                do update set
                  title = excluded.title,
                  body = excluded.body,
                  item_type = excluded.item_type,
                  status = excluded.status,
                  canton = 'ZH',
                  source_url = excluded.source_url,
                  last_seen_at = now(),
                  updated_at = now(),
                  review_status = 'queued'
                """,
                (source_id, ext, title, body, item_type, status, source_url),
            )
            if cur.rowcount == 1:
                ins += 1
            else:
                upd += 1

        conn.commit()

    print(f"zh_items={len(items)} inserted={ins} updated={upd}")


if __name__ == "__main__":
    main()
