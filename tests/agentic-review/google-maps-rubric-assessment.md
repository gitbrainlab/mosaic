# Google Maps Mobile Rubric Assessment

Date: 2026-05-29
Benchmark target: Google Maps place view for `Control Tower` on iPhone 16 Pro-sized mobile viewport
Playwright viewport: `402x874`, DPR `3`, mobile Safari user agent, touch enabled

## Evidence

Native app reference screenshots supplied by user:

- `/tmp/codex-remote-attachments/019e71ca-472f-7833-b7f5-0fee65d30115/652C1929-24F0-46B0-9B1E-00FA19466CAD/1-Photo-1.jpg`
- `/tmp/codex-remote-attachments/019e71ca-472f-7833-b7f5-0fee65d30115/652C1929-24F0-46B0-9B1E-00FA19466CAD/2-Photo-2.jpg`
- `/tmp/codex-remote-attachments/019e71ca-472f-7833-b7f5-0fee65d30115/652C1929-24F0-46B0-9B1E-00FA19466CAD/3-Photo-3.jpg`
- `/tmp/codex-remote-attachments/019e71ca-472f-7833-b7f5-0fee65d30115/652C1929-24F0-46B0-9B1E-00FA19466CAD/4-Photo-4.jpg`

Playwright mobile-web artifacts:

- `tests/agentic-review/artifacts/google-maps-iphone16pro-2026-05-29-web2/01-initial-search.png`
- `tests/agentic-review/artifacts/google-maps-iphone16pro-2026-05-29-web2/03-sheet-expanded.png`
- `tests/agentic-review/artifacts/google-maps-iphone16pro-2026-05-29-web2/04-photo-row-scroll.png`
- `tests/agentic-review/artifacts/google-maps-iphone16pro-2026-05-29-web2/google-maps-benchmark.json`

Important caveat: Playwright can observe Google Maps mobile web, not the native iOS app. Mobile web inserts an app-upgrade affordance and eventually becomes more web-document-like than the native app screenshots. The native screenshots are the stronger interaction benchmark.

## High-Level Read

Google Maps feels tight because the interface behaves like a physical instrument placed over the map, not like a page that happens to contain a map. The map is always spatially alive, and every surface uses progressive disclosure:

1. Search/map state: floating search, selected pin, contextual chips, street-view/location affordances.
2. Peek place state: title and primary actions only, while the map still dominates.
3. Half place state: rating, status, actions, and photo preview, with roughly half the screen still map.
4. Expanded place state: full place dossier with tabs, but a sliver of map/background remains as spatial memory.

The strongest lesson for Mosaic: do not think of the place/detail view as a card or page. Think of it as a native-feeling control surface that snaps, scrolls, and reveals information in layers.

## Rubric Scores

Scale: 1 weak, 5 excellent.

| Dimension | Google Maps Native Reference | Google Maps Mobile Web via Playwright | Mosaic Implication |
| --- | ---: | ---: | --- |
| Map as first-class citizen | 5 | 3 | Mosaic should keep map visible and useful through every detail state. |
| Progressive disclosure | 5 | 3 | Mosaic needs clearer snap states: peek, half, expanded, full dossier. |
| UI tightness/density | 5 | 4 | Controls are dense, large enough, and spatially consistent. Mosaic can tighten without becoming busy. |
| Motion/transition handling | 5 | 3 | Google's native sheet feels like a device control; Mosaic should add stronger snap/drag polish and map padding. |
| Place information scale | 5 | 4 | Title, rating, status, actions, photos, and tabs appear in a precise hierarchy. |
| Photo integration | 5 | 4 | Photos are not decoration; they are the transition into the place dossier. |
| Continuation/discovery | 4 | 3 | Google preserves context and actions, but Mosaic can exceed it with next/nearby controls. |
| Static/PWA feasibility for Mosaic | n/a | n/a | Most patterns are feasible with static JSON, DOM, CSS, and MapLibre. |

## What Google Gets Right

### 1. The Map Remains A Living Backdrop

In the supplied screenshots, the map is not a framed component. It is the environment. The search bar, layer button, street-view thumbnail, location button, and sheet all float above it. Even when the sheet expands, map imagery remains visible behind the top safe area.

Mosaic gap:

- The desktop detail bottom panel can leave the map feeling like a shallow strip.
- First-load map tests currently pass on marker DOM count even when the visible camera is weak.

Mosaic guidance:

- Treat every overlay as map-aware.
- Assert visible marker geometry, not only marker existence.
- With detail open, preserve at least 55% map height on desktop and a meaningful map sliver on mobile.

### 2. Snap States Are Semantic

Google's sheet states are not arbitrary heights:

- Peek: identity and primary actions.
- Half: identity, rating/status, action rail, photo rail.
- Expanded: media, tabs, overview modules, then operational facts.

The user can read each state as a complete mode. Nothing feels like half a broken card.

Mosaic gap:

- Current mobile detail opens to a functional sheet, but the state does not yet feel as intentionally staged.
- Photo-rich details can show images but hide trust cues.
- No-photo states are informative but generic.

Mosaic guidance:

- Define snap-state content contracts:
  - Peek: title, location/city, confidence, one photo/no-photo signal, next action.
  - Half: hero photo or premium visual placeholder, action row, one evidence/trust cue.
  - Full: evidence, tags, notes, photos, refinement action.

### 3. Actions Are Big, Repeated, And Horizontally Scannable

Google's action row is large and icon-led: Directions, Start, Ask, Call, Save, Share. It is horizontally scrollable, but the first actions carry the user's likely intent.

Mosaic gap:

- Mosaic detail views mostly present information; they do not yet provide enough next-step controls.
- The panel feedback repeatedly asked for `next nearby`, photo refinement, and curator actions.

Mosaic guidance:

- Add a horizontal action rail in detail:
  - `Next nearby`
  - `Save` or `Add note` if a static local-only mode exists later
  - `Suggest edit` / `Request refinement`
  - `Share`
- For Studio, use the same action grammar: `Approve`, `Refine`, `Reject`, `Photo issue`.

### 4. Photo Presentation Carries The Place

In the native reference, photos appear as a masonry-like rail that starts immediately below the action row. In the expanded state, imagery creates an emotional bridge before operational facts. The photo module is not a separate gallery page; it is embedded in the place surface.

Mosaic gap:

- Photo-rich details are a strong start, but need trust cues and better continuation.
- Studio currently says photos/briefs exist but does not show visual review material.

Mosaic guidance:

- Put the first photo/no-photo placeholder above long description.
- Pair every photo module with a caption/source/trust cue.
- In Studio, show thumbnails and briefs directly in the queue.

### 5. The UI Feels Like A Device, Not An App

The native screenshots show why:

- Status bar overlays the map instead of forcing a page header.
- Search bar has device-like pill geometry and large hit areas.
- The sheet has a physical drag handle and rounded top corners.
- Tabs and action rails align to thumb movement.
- Scrolling happens inside the place surface while spatial memory remains.

Mosaic gap:

- Mosaic is still closer to a static web app with map plus panels.
- Some controls are below the 44px comfortable touch target.

Mosaic guidance:

- Increase header action hit areas to at least 44px.
- Use one consistent sheet handle and snap behavior.
- Keep all action rails thumb-scaled.
- Avoid nested card composition inside sheets.

## Direct Rubric Updates For Mosaic

Add these rubric checks to the agentic harness once implementation catches up:

1. Visible marker check:
   - At least one marker bounding box is inside the unobscured map viewport after first load.

2. Snap-state contract:
   - Mobile detail peek/half/full each has expected content, not just a visible sheet.

3. Map/detail balance:
   - Desktop detail keeps `#map` at least 55% of viewport height.
   - Mobile expanded detail leaves a spatial memory strip or clear route back to map.

4. Action rail:
   - Place/detail shows a horizontally scannable action row with at least one continuation action.

5. Photo/trust pairing:
   - If a photo is visible, a caption/source/trust cue is visible nearby.
   - If no photo is visible, map-aware visual-language text appears.

6. Empty states:
   - Search/filter shows result rows or a premium empty state with reset.

7. Dark sheet contrast:
   - First five visible rows in dark bottom sheets meet contrast and remain readable.

8. Device-like touch targets:
   - Header/list/action controls are at least 44px high.

## Concrete Mosaic Design Moves

Short term:

- Fix dark sheet row colors and header hit areas.
- Add explicit no-results state.
- Make no-photo copy map-aware.
- Add `Next nearby` to detail views.

Medium term:

- Rework mobile detail into semantic snap states.
- Add visible marker geometry checks and repair misframed first-load maps.
- Add Studio queues with photo/profile feedback.

Longer term:

- Make the map/detail interaction feel like one physical object: map adjusts padding, marker remains selected, sheet snaps smoothly, and action rail keeps the user's next move in reach.
