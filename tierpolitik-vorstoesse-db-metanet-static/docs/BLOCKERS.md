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
- **Current blocker:** reproducible headless requests do not reliably recreate the same result context (server-side form/session state via `FrmProperty` etc.).

### Next best options
1. Capture exact browser request payload/cookies for `FrmRequest=Search` and replay in connector.
2. If replay remains brittle, use browser-driven extraction (first pages + iterative offsets) as interim connector.
