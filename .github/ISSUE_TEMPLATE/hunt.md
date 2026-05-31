---
name: Mosaic Hunt
about: Start a GitHub-native research/enrichment Hunt
title: "Hunt: "
labels: ["research", "hunt"]
assignees: ""
---

## Hunt Request

Topic:

Intent:

Scope:

## Location Bounds

Use exact coordinates when the Hunt is geographically scoped.

```json
{
  "label": "",
  "coordinateBounds": {
    "minLat": null,
    "maxLat": null,
    "minLng": null,
    "maxLng": null
  }
}
```

## Constraints

- Exact street-level address required.
- Coordinates must match the street address and stay inside declared bounds when present.
- Evidence must be current or recently corroborated.
- No generic chains, stale filler, or closed places unless explicitly justified.

## Photo Policy

Only use real, location-tied photos that visibly show the thing the map is about. Stock photos, generic storefronts, and unrelated visuals must stay out of public entries.

## Exclusions

- Stock photos
- Weakly sourced candidates
- Generic filler

## Target Scale

Initial review batch:

Final target:

## Normalized HuntSpec

The static app will prefill this block. Agents should parse it first and fall back to the sections above only if the JSON block is missing.

<!-- mosaic-hunt-spec:start -->
```json
{}
```
<!-- mosaic-hunt-spec:end -->
