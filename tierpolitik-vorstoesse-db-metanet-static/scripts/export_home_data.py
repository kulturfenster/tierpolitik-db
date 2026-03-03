#!/usr/bin/env python3
import json
import os
from datetime import date
from pathlib import Path

import psycopg
from dotenv import load_dotenv

OUT = Path('.netlify/functions/home-data')


def iso_or_today(d):
    if d:
        return d.isoformat()
    return date.today().isoformat()


def map_type(item_type: str | None) -> str:
    t = (item_type or '').lower()
    if 'motion' in t:
        return 'Motion'
    if 'postulat' in t:
        return 'Postulat'
    if 'anfrage' in t:
        return 'Anfrage'
    if 'initiative' in t:
        return 'Volksinitiative'
    if 'interpell' in t:
        return 'Interpellation'
    if 'weisung' in t:
        return 'Anfrage'
    return 'Anfrage'


def main():
    load_dotenv('.env')
    db = os.environ.get('DATABASE_URL')
    if not db:
        raise SystemExit('DATABASE_URL fehlt')

    limit = int(os.environ.get('TPM_HOME_LIMIT', '800'))

    with psycopg.connect(db) as conn, conn.cursor() as cur:
        cur.execute(
            """
            select i.external_id, i.title, i.body, i.item_type, i.status, i.submitted_at,
                   i.updated_at::date, i.source_url, i.canton, i.municipality,
                   coalesce(c.label,'no') as label, c.reason, s.name as source_name
            from politics_monitor.pm_items i
            join politics_monitor.pm_sources s on s.id = i.source_id
            left join politics_monitor.pm_classification c on c.item_id = i.id
            where i.home_visible = true
              and coalesce(c.label,'no') in ('yes','unsure')
            order by i.submitted_at desc nulls last, i.updated_at desc
            limit %s
            """,
            (limit,),
        )
        rows = cur.fetchall()

    out = []
    for r in rows:
        ext, title, body, item_type, status, sub_date, upd_date, url, canton, municipality, label, reason, source_name = r
        out.append({
            'id': f'vp-{str(ext).lower()}',
            'titel': title or f'Vorstoss {ext}',
            'typ': map_type(item_type),
            'kurzbeschreibung': (body or title or '')[:700] or 'Kein Beschreibungstext verfügbar.',
            'geschaeftsnummer': str(ext),
            'ebene': 'Gemeinde' if municipality else ('Kanton' if canton else 'Bund'),
            'kanton': canton,
            'regionGemeinde': municipality,
            'status': 'Eingereicht',
            'datumEingereicht': iso_or_today(sub_date),
            'datumAktualisiert': iso_or_today(upd_date),
            'themen': ['Tiere', 'Tierpolitik'] if label == 'yes' else ['Tiere (unsicher)'],
            'schlagwoerter': [k for k in ['zoo', 'wildtier', 'schlachthof', 'tierschutz'] if (title or '').lower().find(k) >= 0] or ['tierpolitik'],
            'einreichende': [{'name': source_name or 'Unbekannt', 'rolle': 'Gemeinderat', 'partei': 'Unbekannt'}],
            'linkGeschaeft': url,
            'resultate': [],
            'medien': [],
            'metadaten': {
                'sprache': 'de',
                'haltung': 'neutral/unklar' if label == 'unsure' else 'pro-tierschutz',
                'zuletztGeprueftVon': 'Tierpolitik Monitor'
            }
        })

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, ensure_ascii=False), encoding='utf-8')
    print(f'wrote {len(out)} items to {OUT}')


if __name__ == '__main__':
    main()
