# Blockers (2026-03-04)

## BL (Basel-Landschaft) connector onboarding

- **Goal:** add Landrat BL source to monitor for canton coverage progress.
- **Attempted endpoints:**
  - `https://www.baselland.ch/politik-und-behorden/landrat-parlament/geschaefte`
  - related Landrat pages under `baselland.ch`
- **Observed result:** HTTP 403 / Cloudflare challenge for headless fetch (both urllib and web_fetch).

### Impact
- Canton coverage remains at `3/26` (BE, BS, ZH) until a BL ingestion path is found.

### Next best options
1. Browser-assisted connector bootstrap (interactive session to discover API/XHR endpoints).
2. Official BL open-data endpoint (JSON/CSV/RSS) that is not behind WAF.
3. Temporary manual export/import route for BL until API path is available.

## AG (Aargau) connector bootstrap

- **Goal:** add AG source with historical depth (target to 2000).
- **Discovered:** working parliamentary app endpoint exists at
  `https://www.ag.ch/grossrat/grweb/de/172/Geschäfte?ResetBreadCrumbs=T&ResetFilter=T`.
- Search can produce result list with ~5923 items and pagination links (`Offset=...`) in browser session.
- **Current blocker:** resolved (form fields are reproducible). New blocker: connector needs reliable pagination; first implementation was too slow and got SIGTERM.

### Next best options
1. Implement pagination with explicit `Offset` stepping based on `Seite 1 von N` and stop conditions.
2. Add caps (`TPM_AG_MAX_PAGES`, `TPM_AG_MAX_ROWS`) and iterate in scheduled runs to gradually backfill.
3. Optional: parse/derive submitted_at from detail page if needed.

## BE (Bern) pre-2012 historical depth

- **Goal:** make BE fulfill strict canton rule (data back to year 2000).
- **Observed limitation:** current official feeds/UI seem to start at **2012**.
  - OGD `geschaeft.json`: oldest `submitted_at` observed ~2012.
  - rrgr-service search template (instance `575c32f7-7571-40f8-8bf7-7504a321b282`) exposes year facets only back to 2012.

### Next best options
1. Find a truly legacy BE source (pre-2012) — older archive page / export endpoint.
2. If no legacy source exists: relax fulfillment rule for BE or treat BE as "fulfilled to available history".
