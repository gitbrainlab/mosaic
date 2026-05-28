# Mosaic v2 Handoff

Date: 2026-05-28

## Objective

Prepare Mosaic for a trustworthy v2 deployment at `http://gitbrain.com/mosaic/v2/` while keeping the public app 100% static.

## Completed

- Replaced the Albany-only coordinate checker with a manifest-aware validator.
- Added optional `manifest.validation.coordinateBounds` for localized maps.
- Updated `npm run validate-data` to validate every committed map.
- Fixed smoke test discovery and made the smoke suite run against the `/mosaic/v2/` production base path.
- Made mobile Playwright projects use Chromium so local smoke tests do not require WebKit.
- Fixed map-card navigation to use the router.
- Fixed MapLibre manifest center conversion from `[lat, lng]` to `[lng, lat]`.
- Fixed relative photo URL handling for clean routes and `/mosaic/v2/`.
- Added GitHub Pages v2 deployment artifact preparation.
- Added a root `404.html` redirect for GitHub Pages SPA deep links.
- Fixed batch runner concurrency so `--max-parallel` actually runs multiple agents.
- Fixed aggregate dedupe logic for evidence and photo briefs.
- Added workflow validation before public data commits and upload of raw research artifacts.
- Added a static Curation Studio batch review surface at `/studio`.

## Current Verification

- `npm test` passes:
  - TypeScript check
  - All-map data validation
  - Mobile Chromium smoke tests for gallery, map navigation, list button, and Studio

## Deployment Notes

- Pages config reports `html_url` as `http://gitbrain.com/mosaic/`.
- The deploy workflow now builds with `VITE_BASE_PATH=/mosaic/v2/`.
- The uploaded artifact places the app under `pages/v2/`, so v2 should land at `http://gitbrain.com/mosaic/v2/` after pushing to `main` and the Pages workflow completes.
- GitHub Pages deep-link behavior uses the checked-in `public/404.html`. Local Vite preview does not serve that custom 404 body for arbitrary nested paths, so smoke tests use the GitHub Pages fallback URL form: `/mosaic/v2/?/map/...`.

## Known Follow-Ups

- `MapView` is still too large and should be split into renderer, detail view, filters, and URL-state modules.
- The MapLibre chunk remains large; code splitting beyond dynamic `MapView` should be considered later.
- Research workflows still produce raw artifacts first; automatic ingest remains a separate future orchestration step.
- Putnam Market was downgraded to low confidence because the product-level ice cream/gelato claim needs stronger verification.
