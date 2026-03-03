#!/usr/bin/env python3
import os

import psycopg
from dotenv import load_dotenv


def main():
    load_dotenv('.env')
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise SystemExit('DATABASE_URL fehlt in .env')

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(
            """
            select r.id, s.source_key, s.name, r.status, r.started_at, r.finished_at,
                   r.items_fetched, r.items_inserted, r.items_updated, r.items_failed, r.error_message
            from politics_monitor.pm_runs r
            left join politics_monitor.pm_sources s on s.id = r.source_id
            order by r.started_at desc
            limit 1
            """
        )
        run = cur.fetchone()

        if not run:
            print('Keine Runs gefunden.')
            return

        run_id = run[0]
        print(f"run_id={run[0]}")
        print(f"source_key={run[1]}")
        print(f"source_name={run[2]}")
        print(f"status={run[3]}")
        print(f"started_at={run[4]}")
        print(f"finished_at={run[5]}")
        print(f"items_fetched={run[6]}")
        print(f"items_inserted={run[7]}")
        print(f"items_updated={run[8]}")
        print(f"items_failed={run[9]}")
        print(f"error_message={run[10] or ''}")

        cur.execute(
            """
            select i.external_id, i.title, i.status, i.submitted_at, i.source_url
            from politics_monitor.pm_items i
            where i.source_id = (select source_id from politics_monitor.pm_runs where id = %s)
            order by i.last_seen_at desc
            limit 10
            """,
            (run_id,),
        )
        rows = cur.fetchall()

    print('\nlatest_items:')
    if not rows:
        print('(none)')
        return

    for idx, row in enumerate(rows, 1):
        print(f"{idx}. {row[0]} | {row[1]} | {row[2] or '-'} | {row[3] or '-'}")
        print(f"   {row[4] or '-'}")


if __name__ == '__main__':
    main()
