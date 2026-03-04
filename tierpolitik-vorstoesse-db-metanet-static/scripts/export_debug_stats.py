#!/usr/bin/env python3
import json
import os
from pathlib import Path

import psycopg
from dotenv import load_dotenv

OUT = Path('data/debug-stats.json')
CANTONS_26 = ['AG','AI','AR','BE','BL','BS','FR','GE','GL','GR','JU','LU','NE','NW','OW','SG','SH','SO','SZ','TG','TI','UR','VD','VS','ZG','ZH']
TARGET_MUNICIPALITIES = int(os.environ.get('TPM_TARGET_MUNICIPALITIES', '2000'))
KNOWN_AVAILABLE_MIN_YEAR = {
    'BE': 2012,  # current known floor of accessible BE OGD/archive endpoint
}


def main():
    load_dotenv('.env')
    db = os.environ.get('DATABASE_URL')
    if not db:
        raise SystemExit('DATABASE_URL fehlt')

    payload = {}

    with psycopg.connect(db) as conn, conn.cursor() as cur:
        cur.execute("select count(*) from politics_monitor.pm_items")
        payload['items_total'] = cur.fetchone()[0]

        cur.execute("select count(*) from politics_monitor.pm_items where home_visible=true")
        payload['items_home_visible'] = cur.fetchone()[0]

        cur.execute("""
            select count(*)
            from politics_monitor.pm_items i
            join politics_monitor.pm_classification c on c.item_id=i.id
            where i.home_visible=true and c.label='yes'
        """)
        payload['items_home_yes'] = cur.fetchone()[0]

        cur.execute("""
            select count(*)
            from politics_monitor.pm_items i
            join politics_monitor.pm_classification c on c.item_id=i.id
            where i.review_status='queued' and c.label in ('yes','unsure')
        """)
        payload['review_queue'] = cur.fetchone()[0]

        cur.execute("""
            select coalesce(c.label,'none') as label, count(*)
            from politics_monitor.pm_items i
            left join politics_monitor.pm_classification c on c.item_id=i.id
            group by 1 order by 2 desc
        """)
        payload['labels'] = [{'label': r[0], 'count': r[1]} for r in cur.fetchall()]

        cur.execute("""
            select s.source_key,
                   count(*) as total,
                   count(*) filter (where i.home_visible=true) as home_visible,
                   count(*) filter (where c.label='yes') as yes,
                   count(*) filter (where c.label='unsure') as unsure,
                   count(*) filter (where i.review_status='queued') as queued
            from politics_monitor.pm_items i
            join politics_monitor.pm_sources s on s.id=i.source_id
            left join politics_monitor.pm_classification c on c.item_id=i.id
            group by s.source_key
            order by total desc
        """)
        payload['by_source'] = [
            {
                'source_key': r[0],
                'total': r[1],
                'home_visible': r[2],
                'yes': r[3],
                'unsure': r[4],
                'queued': r[5],
            }
            for r in cur.fetchall()
        ]

        cur.execute("""
            select coalesce(i.canton,'(none)') as canton,
                   count(*) as total,
                   count(*) filter (where c.label='yes') as yes,
                   count(*) filter (where i.home_visible=true and c.label='yes') as home_yes
            from politics_monitor.pm_items i
            left join politics_monitor.pm_classification c on c.item_id=i.id
            group by canton
            order by total desc
        """)
        payload['by_canton'] = [
            {'canton': r[0], 'total': r[1], 'yes': r[2], 'home_yes': r[3]}
            for r in cur.fetchall()
        ]

        cur.execute("""
            select coalesce(i.municipality,'(none)') as municipality,
                   count(*) as total,
                   count(*) filter (where c.label='yes') as yes,
                   count(*) filter (where i.home_visible=true and c.label='yes') as home_yes
            from politics_monitor.pm_items i
            left join politics_monitor.pm_classification c on c.item_id=i.id
            group by municipality
            order by total desc
            limit 30
        """)
        payload['by_municipality_top'] = [
            {'municipality': r[0], 'total': r[1], 'yes': r[2], 'home_yes': r[3]}
            for r in cur.fetchall()
        ]

        target_year = int(os.environ.get('TPM_YEAR_TARGET_MIN', '2000'))

        cur.execute("""
            select upper(canton) as canton,
                   count(*) as total,
                   min(extract(year from submitted_at))::int as oldest_year,
                   max(extract(year from submitted_at))::int as newest_year
            from politics_monitor.pm_items
            where canton is not null and canton <> ''
            group by upper(canton)
        """)
        canton_rows = {r[0]: {'total': r[1], 'oldest_year': r[2], 'newest_year': r[3]} for r in cur.fetchall()}

        by_canton_progress = []
        fulfilled = []
        fulfilled_available = []
        for c in CANTONS_26:
            total = canton_rows.get(c, {}).get('total', 0)
            oldest = canton_rows.get(c, {}).get('oldest_year')
            newest = canton_rows.get(c, {}).get('newest_year')
            is_fulfilled = bool(total > 0 and oldest is not None and oldest <= target_year)
            available_min = KNOWN_AVAILABLE_MIN_YEAR.get(c)
            is_fulfilled_available = bool(
                total > 0 and oldest is not None and (
                    oldest <= target_year or (available_min is not None and oldest <= available_min)
                )
            )
            if is_fulfilled:
                fulfilled.append(c)
            if is_fulfilled_available:
                fulfilled_available.append(c)
            by_canton_progress.append({
                'canton': c,
                'total': total,
                'oldest_year': oldest,
                'newest_year': newest,
                'target_min_year': target_year,
                'available_min_year': available_min,
                'fulfilled': is_fulfilled,
                'fulfilled_available': is_fulfilled_available,
            })

        payload['canton_progress'] = {
            'fulfilled': len(fulfilled),
            'target': 26,
            'fulfilled_cantons': fulfilled,
            'missing_cantons': [c for c in CANTONS_26 if c not in fulfilled],
            'fulfilled_available': len(fulfilled_available),
            'fulfilled_available_cantons': fulfilled_available,
            'missing_available_cantons': [c for c in CANTONS_26 if c not in fulfilled_available],
            'by_canton': by_canton_progress,
        }

        cur.execute("""
            select min(extract(year from submitted_at))::int,
                   max(extract(year from submitted_at))::int
            from politics_monitor.pm_items
            where submitted_at is not null
        """)
        min_year, max_year = cur.fetchone()
        import datetime as _dt
        current_year = _dt.datetime.now(_dt.timezone.utc).year
        observed_min = min_year if min_year is not None else current_year
        observed_max = max_year if max_year is not None else current_year
        span_total = max(1, current_year - target_year)
        span_done = max(0, min(span_total, current_year - observed_min))
        payload['year_progress'] = {
            'current_year': current_year,
            'target_min_year': target_year,
            'oldest_year': observed_min,
            'newest_year': observed_max,
            'covered_years_back': span_done,
            'target_years_back': span_total,
        }

        cur.execute("""
            select count(distinct municipality)
            from politics_monitor.pm_items
            where municipality is not null and municipality <> '' and municipality <> '(none)'
        """)
        municipalities_covered = cur.fetchone()[0] or 0
        payload['municipality_progress'] = {
            'covered': municipalities_covered,
            'target': TARGET_MUNICIPALITIES,
        }

        canton_ratio = (len(fulfilled) / 26.0)
        year_ratio = (span_done / max(1, span_total))
        municipality_ratio = (municipalities_covered / max(1, TARGET_MUNICIPALITIES))
        project_ratio = (0.45 * canton_ratio) + (0.35 * year_ratio) + (0.20 * municipality_ratio)
        payload['project_progress'] = {
            'ratio': round(project_ratio, 4),
            'percent': round(project_ratio * 100, 1),
            'weights': {'cantons': 0.45, 'years': 0.35, 'municipalities': 0.20},
            'components': {
                'cantons': {'fulfilled': len(fulfilled), 'target': 26},
                'years': {'covered_years_back': span_done, 'target_years_back': span_total},
                'municipalities': {'covered': municipalities_covered, 'target': TARGET_MUNICIPALITIES},
            },
        }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'wrote {OUT}')


if __name__ == '__main__':
    main()
