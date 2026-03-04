# Next Steps v0 — Stallbrände Schweiz

## Current blocker
Raw seed crawl only fetches landing pages (portal/search pages), not article detail pages.
This yields almost no direct `stallbrand` keyword hits in text snippets.

### Validation run (2026-03-04 00:00 CET)
- `python3 scripts/crawler_v0.py` → 8 raw rows written
- `python3 scripts/extract_candidates_v0.py` → 0 candidates
- Result confirms blocker is structural (seed-level crawl), not transient fetch failure.

## Required next step
Build source-specific article extractors:
1. collect article links from each source/search page
2. fetch article detail pages
3. run keyword + date + location extraction on article text
4. write to `events.raw.v1.jsonl` + `events.candidates.v1.jsonl`

## Priority source order
1. SRF search results
2. police.be.ch media list
3. stadt-zuerich police media
4. luzern police media
5. aargau police media



### Progress update (2026-03-04 00:44 CET)
- Upgraded crawler v0 to persist HTML snapshots per source (`data/stallbraende/snapshots.v0/*.html`) and store `html_path` in `events.raw.v0.jsonl`.
- Added link extraction step (`scripts/extract_links_v0.py`) from snapshot hrefs with keyword hints.
- Validation run:
  - raw rows: 8 (with HTML snapshots: 4)
  - extracted links: 23
  - keyword candidates: 0

### Current blocker (new)
- Half of seed sources currently fail to return HTML content (likely anti-bot / dynamic rendering / transient blocks), so detail-link coverage is still incomplete.
- Candidate extractor still runs on seed-level snippets; next step is article-detail fetch over `links.raw.v0.jsonl`.
