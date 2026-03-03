#!/usr/bin/env python3
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

OUT_JSON = Path('data/review-inbox.json')


def main():
    load_dotenv('.env')
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise SystemExit('DATABASE_URL fehlt in .env')

    limit = int(os.environ.get('TPM_REVIEW_LIMIT', '200'))

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            select
              i.id,
              s.source_key,
              i.external_id,
              i.title,
              i.body,
              i.item_type,
              i.status,
              i.submitted_at,
              i.source_url,
              coalesce(c.label, 'unsure') as label,
              c.confidence,
              c.reason,
              i.last_seen_at
            from politics_monitor.pm_items i
            join politics_monitor.pm_sources s on s.id = i.source_id
            left join politics_monitor.pm_classification c on c.item_id = i.id
            order by
              case coalesce(c.label, 'unsure') when 'yes' then 0 when 'unsure' then 1 else 2 end,
              i.last_seen_at desc
            limit %s
            """,
            (limit,),
        )
        rows = cur.fetchall()

    items = []
    for r in rows:
        items.append(
            {
                "item_id": r[0],
                "id": f"{r[1]}:{r[2]}",
                "source_key": r[1],
                "external_id": r[2],
                "title": r[3],
                "summary": r[4],
                "type": r[5],
                "status": r[6],
                "submitted_at": r[7].isoformat() if r[7] else None,
                "url": r[8],
                "label": r[9],
                "confidence": float(r[10]) if r[10] is not None else None,
                "reason": r[11],
                "last_seen_at": r[12].isoformat() if r[12] else None,
                "review_status": "queued",
            }
        )

    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f"wrote {len(items)} items -> {OUT_JSON}")


if __name__ == '__main__':
    main()
