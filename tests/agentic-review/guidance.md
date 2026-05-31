# Mosaic Agentic UI Review Guidance

This file is the shared brief for human reviewers, LLM reviewers, and future GitHub Actions agents that inspect Playwright artifacts.

## Chair Prompt

You are an expert UI/UX designer + senior frontend engineer specializing in premium, timeless, mobile-first static SPAs (GitHub Pages / vanilla JS or lightweight frameworks).

Project: Mosaic — a 100% static, community-curated knowledge map platform. All intelligence lives in GitHub Actions agents; the frontend is purely static and must remain that way. The experience must feel quietly confident, curatorial, and premium.

Current live version: http://gitbrain.com/mosaic/v3/

Important: The screenshots in previous context are outdated. This is the new v3 application. Open the live site in a browser, inspect routes, state, data loading, bottom nav, gallery/hunt flow, map views, detail sheets/panels, themes, and any Studio/Batches surface. Explore user journeys end-to-end: gallery -> hunt -> map -> detail.

## Core Constraints

- Must remain 100% static on GitHub Pages.
- Mobile-first, responsive across desktop, tablet, and mobile.
- Keep the map as the first-class citizen at all times.
- Support both casual explorers and curators/power users.
- Everything eventually commits as static JSON and images.
- Do not add runtime services, databases, or browser-side agent behavior.

## Design Panel North Star

The request referenced a longer prior "Design Panel Review: Mosaic" that was not included verbatim in this workspace context. Until that full text is pasted into this file, use the explicit high-priority guidance below as the operative review brief.

Prioritize:

- Photo-first presentation on mobile BottomSheet and desktop detail surfaces that never hides the map unnecessarily.
- Graceful "no photos yet" states that feel premium, credible, and intentionally curated.
- Batch review and refinement surfaces in Studio, or an integrated flow, that support visual feedback on photos and profiles and feel like a natural extension of "Launch Hunt."
- Overall density, hierarchy, and polish, especially gallery/hunt branding repetition, map first-load, and detail surface weight.
- Quick wins that reduce clicks and map repositions while exploring.

## Original Review Package Excerpts

Pain points:

- Wasted vertical space and repeated "Mosaic" branding in gallery/hunt.
- Disorienting first-load map states.
- Detail views that overpower the map.
- Almost zero high-quality photos today.
- Discovery feels click-heavy.

Personas:

- Casual Explorer: wants rich, visual discovery and trustworthy depth.
- Topic Requester: wants to launch a specific map hunt with nuanced guidance.
- Curator / Power User: wants to review batches, improve quality, give photo/profile feedback, and trigger refinements.

Photo strategy:

- Product-centered only.
- No storefronts, parking lots, or generic filler.
- Agents can generate excellent photo briefs before real images exist.
- No-photo states and batch visual feedback are first-class design problems.

Research loop:

- Scout -> Hunt/Enrich -> Present/Review -> Update/Feedback via GitHub Issues.
- Batches are emerging and need a credible static UI review surface.

Immediate polish actions:

- Reduce repeated branding.
- Shorten hero language.
- Remove temporary phase labels.
- Improve map first-load.

## Expected Review Output

Panel feedback should be concrete enough for an implementation agent to act on without asking for hidden context. Prefer:

- Specific finding, with journey and viewport.
- Why it matters for Mosaic's product promise.
- Recommended implementation guidance.
- Acceptance criteria that can be encoded in Playwright.
- Static data shape recommendations when a workflow needs JSON.
