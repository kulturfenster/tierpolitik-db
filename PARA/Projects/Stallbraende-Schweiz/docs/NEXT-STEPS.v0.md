# Next Steps v0 — Stallbrände Schweiz

## Current blocker
Raw seed crawl only fetches landing pages (portal/search pages), not article detail pages.
This yields almost no direct `stallbrand` keyword hits in text snippets.

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

