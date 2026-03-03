#!/usr/bin/env python3
import os
from pathlib import Path
from dotenv import load_dotenv
import psycopg

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / 'migrations' / '003_home_visibility.sql'

load_dotenv(ROOT / '.env')
db = os.getenv('DATABASE_URL')
if not db:
    raise SystemExit('DATABASE_URL missing')

with psycopg.connect(db) as conn, conn.cursor() as cur:
    cur.execute(MIGRATION.read_text(encoding='utf-8'))
    conn.commit()

print(f'Applied migration: {MIGRATION.name}')
