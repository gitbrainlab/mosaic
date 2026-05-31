# Mosaic Studio Workflow

This page documents how the Curation Studio works in the current v4 build.

## Purpose

Studio is the curator control surface for reviewing maps, draft Hunts, enrichment jobs, and batch artifacts. It stays static in the browser and reads committed data plus provisional Netlify-backed state.

The core rule is simple:

- Review and draft work can be provisional.
- Public map data only changes after validation and promotion.

## What You Do In Studio

### 1. Review the queue

The top of the Studio view surfaces the review workload:

- `Verification Queue`
- `Needs Photo Review`
- `Refinement Requested`
- `Approved / Committed`

Use the left queue to pick the next entry. The selected item opens in the preview panel.

### 2. Inspect the entry

The preview panel is where you decide what happens next.

Check:

- title and location
- description and map intent
- coordinates and street address
- evidence and source URLs
- real photo evidence
- tags and other attributes

If the item is missing real visual proof, use the photo review path instead of approving it.

### 3. Use the next-stage actions

The right-side action panel produces a structured payload.

Available actions:

- `Approve`
- `Request refinement`
- `Reject`
- `Flag photo issue`
- `Flag evidence issue`

These actions are not just notes. They create a review payload that can be submitted to the protected Studio queue or copied as a fallback.

### 4. Choose the action mode

Studio supports two execution intents:

- `Live provisional` sends the action to Netlify-backed Studio state immediately. This is useful for quick review handling, enrichment, and iteration, but it does not change committed public map data.
- `Batch promotion` stores the action for a grouped research or promotion pass. Use this when several related decisions should update the next batch prompt or GitHub validation run together.

Both modes remain provisional until GitHub validation promotes changes into `public/data/`.

### 5. Add a curator note

The curator note field is where you explain the decision.

Examples:

- `rejected because this is not pizza`
- `Friendly's is a chain`
- `address is not specific enough`
- `needs current product photos from the actual shop`

The note is included in the action payload. If you click `Refine with Grok`, Mosaic turns that note into updated guidance for the next pass.

### 6. Run live enrichment when needed

If an entry needs more evidence, use the live enrichment buttons:

- `Find real photos`
- `Enrich evidence`
- `Verify address`
- `Refine profile`

These create provisional jobs. The result may show candidate photos, evidence notes, and rejection notes, but it still does not modify committed public map data.

## Mobile Behavior

Studio uses a compact mobile layout:

- a pane switcher for `Review`, `Maps`, and `Batches`
- a short workflow summary at the top
- compact map and batch overviews
- the selected review item expands in place

On mobile, the goal is to reduce vertical sprawl without hiding the current work.

## Hunt Workflow

The Hunt path follows the same rule set:

1. Start a Hunt from the static app.
2. Netlify creates a queued or running draft.
3. The draft shows in the Hunt view while it is provisional.
4. Iteration can refine the draft.
5. Promotion sends the Hunt through GitHub validation.
6. Canonical data only lands in `public/data/` after approval.

## Failure Modes

Common issues:

- **Submit failed / Load failed**  
  Netlify functions are unavailable in the current environment. The UI keeps the copied payload available as a fallback.

- **No visible enrichment results**  
  The job may still be queued or the entry may not qualify for live photo enrichment.

- **A map or batch looks missing**  
  Check the committed static data first. Studio is a viewer of committed artifacts, not a writer of public map files.

## What Studio Is Not

Studio is not:

- a freeform editor for public JSON
- a silent auto-publisher
- a backend admin panel

It is a review and coordination surface for curated work that still passes through validation before becoming public.
