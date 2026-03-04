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
