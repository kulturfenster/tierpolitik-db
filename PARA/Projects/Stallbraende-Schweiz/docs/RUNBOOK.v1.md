# Runbook v1 — Stallbrände Schweiz

## Schnellstart
```bash
cd /Users/alf/.openclaw/workspace/PARA/Projects/Stallbraende-Schweiz
./scripts/run_v1_pipeline.sh
```

## Outputs
- `data/stallbraende/events.raw.v0.jsonl`
- `data/stallbraende/links.discovered.v1.jsonl`
- `data/stallbraende/links.prioritized.v1.jsonl`
- `data/stallbraende/links.filtered.v1.jsonl`
- `data/stallbraende/articles.extracted.v1.jsonl`
- `data/stallbraende/articles.filtered.v1.jsonl`
- `data/stallbraende/events.table.v1.json`
- `docs/EVENTS-REPORT.v1.md`

## Qualitäts-Checks (manuell)
1. Enthält `articles.filtered.v1.jsonl` plausible Stallbrand-Fälle?
2. Sind in `events.table.v1.json` Kanton/Tierzahl/Tierart sinnvoll extrahiert?
3. Sind offensichtliche Nicht-Stallbrand-Artikel entfernt?

## Bekannte Lücke (v1)
- Source-Mix noch zu stark medienlastig; für höhere Recall/Precision sind source-spezifische Polizei-Detailcrawler nötig.
