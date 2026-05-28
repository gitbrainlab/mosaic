# Mosaic — UI/UX Design Review Package
**Date**: May 2026  
**Status**: Current State + Open Design Questions

---

## 1. Project Overview

**Mosaic** is a **100% static** (GitHub Pages only), **mobile-first** platform for high-quality, community-curated knowledge maps on any topic.

The platform is designed to feel premium, curatorial, and timeless ("quietly confident").

### Core Loop
1. **Hunt** — User (or automated system) requests research on a topic, with optional rich guidance.
2. **Enrich** — Research agents (currently LLM-powered with Grok, moving toward hybrid LLM + real scraping) discover real places/items, gather evidence, and especially source **product-centered photos**.
3. **Present** — Enriched profiles appear in beautiful, trustworthy public maps.
4. **Feedback & Update** — Curators and interested users can provide feedback (via GitHub Issues today). Agents incorporate that feedback and re-run enrichment. Everything eventually lands as commits to the static site.

**Hard Constraint**: The delivered experience must remain purely static. All intelligence lives in GitHub Actions agents.

---

## 2. Current Public Experience (What Users See Today)

### Gallery + Hunt Launch
- Clean list of maps.
- Primary action is **"Start a Hunt"** — simple topic input + optional "advanced guidance" textarea (users can give very specific constraints, e.g., "only soft serve, has done coffee flavors before, not gas stations, gluten-free cones available").
- This is intentionally lightweight.

### Map View
- MapLibre map + list of entries.
- Search + confidence filters.
- Clicking an entry opens a detail view.

**Current Mobile**: BottomSheet (starts relatively large).
**Current Desktop**: Bottom panel (recent improvement after right-side panel felt too blocking).

### Major Current Pain Points (User Feedback)
- Wasted vertical space and repeated "Mosaic" branding in the gallery/hunt screen.
- When first opening a map, users can land in unhelpful states (wrong centering, slow tile loading, "beige" empty view).
- Detail views (especially on mobile) can feel like they take over the screen with relatively low immediate value.
- Almost zero actual high-quality photos in the system today (biggest upcoming challenge).
- Discovery feels click-heavy — users want to more easily "click the next interesting thing."

---

## 3. The Research / Curation Backend (Mostly Invisible Today)

This is where most of the current development energy is going.

- `research-agent.ts` + `rich-research.ts`: Multi-pass, multi-location, multi-model research.
- Strong recent progress on **photo research** — the agent now generates very specific `photoBriefs` (search queries, expected visuals, suggested sources, priority) with strict rules: **product-centered only**, no storefronts or parking lots.
- Early Playwright scraper foundation for higher accuracy and real photo discovery.
- Batch concept is emerging: groups of related research runs that can be reviewed and refined together.
- Longer-term vision: Nightly automated hunts + smooth feedback loops via GitHub Issues.

**Current Reality**: The agent produces excellent *instructions* for photos and data, but actually obtaining and committing high-quality, real images is still largely manual.

---

## 4. User Personas & Primary Journeys

### A. Casual Explorer
**Goal**: Discover interesting, high-quality maps and feel delighted by the depth and beauty.

**Ideal Journey**:
- Land on gallery → See compelling maps → Open one → Immediately see rich, visual entries (especially appetizing photos) → Open details and feel the authority and care.

**Current Friction**: Lack of photos makes profiles feel thin. Map load state can be disorienting.

### B. Topic Requester ("I want this specific map")
**Goal**: Get high-quality research done on a niche they care about.

**Ideal Journey**:
- Launch a hunt (simple or with very specific guidance) → See that the system understood the nuance → Later discover a rich, photo-supported map has been created.

### C. Curator / Power User (Emerging)
**Goal**: Help improve quality — review batches of research, give targeted feedback on profiles or photos, help source better images, trigger refinements.

**Ideal Journey**:
- See a list of recent or proposed research batches.
- Open a batch → Review profiles + photo briefs (or actual photos) → Give precise feedback ("this photo is perfect", "wrong variant", "needs a shot showing the gluten-free option").
- Trigger targeted re-enrichment.

**Current Gap**: Almost no dedicated surface for this yet.

---

## 5. Key Open Design Questions (Especially Photos)

### Photo Presentation (Highest Priority)
- How should photos appear in the mobile BottomSheet without making it feel oppressive or completely hiding the map?
- On desktop, how do we show photos beautifully without destroying map context (previous right panels were rejected for blocking too much)?
- What does a profile look like when it has excellent photo briefs but zero actual images yet? How do we make this state feel credible and premium rather than broken?
- In a batch review/refinement experience, how should candidate photos (or strong briefs) be displayed so curators can give useful visual feedback?

### Overall Map + Detail Experience
- How do we reduce the feeling of "too many clicks and repositions" to discover the next interesting item?
- What should the ideal first-load state of a map be?
- How should the system handle different densities of data (some maps will be sparse, some very rich)?

### Batch / Refinement Surfaces
- What does a lightweight but credible interface look like for reviewing groups of enriched profiles?
- How does this feel like a natural extension of the simple "Launch Hunt" flow rather than a completely separate admin tool?

---

## 6. Screenshots & Current State (May 2026)

*(Insert fresh screenshots here from the current dev server)*

Recommended captures:
- Gallery / Start a Hunt (guidance collapsed and expanded)
- Ice Cream map — initial load on desktop
- Ice Cream map with detail open (mobile emulation)
- Desktop map view with bottom detail panel
- Any existing photo display examples (currently minimal)

---

## 7. Specific Asks for the Design Panel

1. **Photo-first presentation patterns** for mobile BottomSheet and desktop that keep the map as a first-class citizen.
2. **Graceful "no photos yet" states** that still feel high-quality.
3. **Batch review / refinement surface** concepts that support visual feedback on photos and profiles.
4. **Overall density, hierarchy, and polish** recommendations — the current experience still feels somewhat raw in places (map load, detail weight, header repetition).
5. **Any quick wins** for reducing clicks/repositions while exploring a map.

Please be direct. We are early enough that honest feedback is extremely valuable.

---

*End of Design Review Package*