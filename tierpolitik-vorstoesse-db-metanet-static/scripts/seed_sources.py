#!/usr/bin/env python3
import os

import psycopg
from dotenv import load_dotenv

SQL = """
insert into politics_monitor.pm_sources
(source_key, name, level, country, canton, parser_type, base_url, list_url, is_active, run_interval_minutes)
values
('ch-bund-curia-vista','Bund – Curia Vista (Parlament.ch)','bund','CH',null,'html_list','https://www.parlament.ch','https://www.parlament.ch/de/ratsbetrieb/suche-curia-vista',true,1440),
('ch-be-grosser-rat','Kanton Bern – Grosser Rat Vorstösse','kanton','CH','BE','html_list','https://www.gr.be.ch','https://www.gr.be.ch/de/start/geschaefte/geschaeftssuche',true,1440),
('ch-be-grosser-rat-ogd','Kanton Bern – Grosser Rat OGD Geschäfte','kanton','CH','BE','api_json','https://ogd.parl.apps.be.ch','https://ogd.parl.apps.be.ch/data/geschaeft.json',true,1440),
('ch-bern-stadtrat','Stadt Bern – Stadtrat Vorstösse','gemeinde','CH','BE','html_list','https://stadtrat.bern.ch','https://stadtrat.bern.ch/de/geschaefte/suche',true,1440),
('ch-zh-gemeinderat-api','Stadt Zürich – Gemeinderat Geschäfte (API)','gemeinde','CH','ZH','api_json','https://www.gemeinderat-zuerich.ch','https://www.gemeinderat-zuerich.ch/format/module/politik_axioma/geschaefte/geschaefte_data_server.php?search=done&page=1',true,1440),
('ch-bs-grosser-rat-neu','Basel-Stadt – Neue Vorstösse','kanton','CH','BS','html_list','https://www.grosserrat.bs.ch','https://www.grosserrat.bs.ch/ratsbetrieb/neue-vorstoesse',true,720),
('ch-bl-landrat-talus','Basel-Landschaft – Landratsgeschäfte (Talus)','kanton','CH','BL','html_list','https://baselland.talus.ch','https://baselland.talus.ch/de/politik/cdws/neuste-geschaefte.php',true,720),
('ch-ag-grosser-rat','Aargau – Grosser Rat Geschäfte','kanton','CH','AG','html_list','https://www.ag.ch','https://www.ag.ch/grossrat/grweb/de/172/Gesch%C3%A4fte?ResetBreadCrumbs=T&ResetFilter=T',true,720)
on conflict (source_key) do update set
  name = excluded.name,
  level = excluded.level,
  country = excluded.country,
  canton = excluded.canton,
  parser_type = excluded.parser_type,
  base_url = excluded.base_url,
  list_url = excluded.list_url,
  is_active = excluded.is_active,
  run_interval_minutes = excluded.run_interval_minutes,
  updated_at = now();
"""


def main():
    load_dotenv('.env')
    db_url = os.environ.get('DATABASE_URL')
    if not db_url:
        raise SystemExit('DATABASE_URL fehlt in .env')

    with psycopg.connect(db_url) as conn, conn.cursor() as cur:
        cur.execute(SQL)
        cur.execute("select id, source_key, name, level, parser_type, is_active from politics_monitor.pm_sources order by id")
        rows = cur.fetchall()
        conn.commit()

    for row in rows:
        print(row)


if __name__ == '__main__':
    main()
