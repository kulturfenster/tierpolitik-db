#!/usr/bin/env python3
import json
import os
import subprocess
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path

import psycopg
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]


def refresh_exports():
    py = os.environ.get('TPM_PYTHON', str(ROOT / '.venv' / 'bin' / 'python'))
    cmds = [
        [py, str(ROOT / 'scripts' / 'export_review_inbox.py')],
        [py, str(ROOT / 'scripts' / 'export_home_data.py')],
    ]
    for cmd in cmds:
        subprocess.run(cmd, cwd=str(ROOT), check=False)


class ReviewHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        if self.path == '/api/health':
            try:
                load_dotenv(ROOT / '.env')
                db_url = os.environ.get('DATABASE_URL')
                if not db_url:
                    raise RuntimeError('DATABASE_URL missing')
                with psycopg.connect(db_url) as conn, conn.cursor() as cur:
                    cur.execute('select 1')
                    cur.fetchone()
                self._json({'ok': True, 'db': 'up'})
            except Exception as e:
                self._json({'ok': False, 'db': 'down', 'error': str(e)}, code=500)
            return
        return super().do_GET()

    def do_POST(self):
        if self.path not in {'/api/review-decision', '/.netlify/functions/feedback-submit'}:
            self.send_error(404, 'Not found')
            return

        length = int(self.headers.get('Content-Length', '0'))
        raw = self.rfile.read(length or 0)

        try:
            load_dotenv(ROOT / '.env')
            db_url = os.environ.get('DATABASE_URL')
            if not db_url:
                raise RuntimeError('DATABASE_URL missing')

            payload = json.loads(raw.decode('utf-8') or '{}')

            if self.path == '/api/review-decision':
                decision = (payload.get('decision') or '').strip().lower()
                item_id = payload.get('id')
                if decision not in {'approved', 'rejected', 'queued'}:
                    raise ValueError('invalid decision')
                if not item_id or ':' not in item_id:
                    raise ValueError('invalid id')
                source_key, external_id = item_id.split(':', 1)

                with psycopg.connect(db_url) as conn, conn.cursor() as cur:
                    cur.execute(
                        """
                        update politics_monitor.pm_items i
                        set review_status = %s,
                            reviewed_at = case when %s = 'queued' then null else now() end,
                            updated_at = now()
                        from politics_monitor.pm_sources s
                        where i.source_id = s.id
                          and s.source_key = %s
                          and i.external_id = %s
                        returning i.id
                        """,
                        (decision, decision, source_key, external_id),
                    )
                    row = cur.fetchone()
                    conn.commit()

                if not row:
                    self._json({'ok': False, 'error': 'item not found'}, code=404)
                    return

                refresh_exports()
                self._json({'ok': True, 'id': item_id, 'decision': decision})
                return

            # Home feedback endpoint: move item back to review and hide from home
            item_id = str(payload.get('id') or '').strip().lower()
            external_id = item_id.removeprefix('vp-') if item_id.startswith('vp-') else item_id
            if not external_id:
                raise ValueError('invalid id')

            with psycopg.connect(db_url) as conn, conn.cursor() as cur:
                cur.execute(
                    """
                    update politics_monitor.pm_items
                    set home_visible = false,
                        review_status = 'queued',
                        reviewed_at = null,
                        updated_at = now()
                    where lower(external_id) = %s
                    returning id
                    """,
                    (external_id,),
                )
                row = cur.fetchone()
                if row:
                    cur.execute(
                        """
                        insert into politics_monitor.pm_classification
                        (item_id, is_animal_related, label, confidence, reason, classifier, classified_at, updated_at)
                        values (%s, null, 'unsure', 0.6, 'user_feedback', 'rules_v2_strict', now(), now())
                        on conflict (item_id) do update set
                          label = 'unsure',
                          is_animal_related = null,
                          reason = 'user_feedback',
                          confidence = greatest(coalesce(politics_monitor.pm_classification.confidence,0),0.6),
                          updated_at = now()
                        """,
                        (row[0],),
                    )
                conn.commit()

            if not row:
                self._json({'ok': False, 'error': 'item not found'}, code=404)
                return

            refresh_exports()
            self._json({'ok': True, 'id': item_id, 'action': 'sent_to_review'})
        except Exception as e:
            self._json({'ok': False, 'error': str(e)}, code=500)

    def _json(self, data, code=200):
        body = json.dumps(data).encode('utf-8')
        self.send_response(code)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    host = os.environ.get('TPM_REVIEW_HOST', '0.0.0.0')
    port = int(os.environ.get('TPM_REVIEW_PORT', '8787'))
    server = ThreadingHTTPServer((host, port), ReviewHandler)
    print(f'Review server on http://{host}:{port} (root={ROOT})')
    server.serve_forever()


if __name__ == '__main__':
    main()
