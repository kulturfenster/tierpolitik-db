#!/usr/bin/env python3
import os
from pathlib import Path

from dotenv import load_dotenv
import psycopg

ROOT = Path(__file__).resolve().parents[1]
MIGRATION = ROOT / "migrations" / "002_review_status.sql"


def main() -> None:
    load_dotenv(ROOT / ".env")
    db_url = os.getenv("DATABASE_URL")
    if not db_url:
        raise SystemExit("DATABASE_URL missing in .env")

    sql = MIGRATION.read_text(encoding="utf-8")
    with psycopg.connect(db_url) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
        conn.commit()

    print(f"Applied migration: {MIGRATION.name}")


if __name__ == "__main__":
    main()
