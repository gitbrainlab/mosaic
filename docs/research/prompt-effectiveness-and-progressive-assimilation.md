# Prompt Effectiveness and Progressive Assimilation

This document defines how Mosaic should measure, evolve, and scale research prompts without creating repeat work or promoting weak data. It applies to ice cream enrichment first, but the structure is intended for any niche map topic.

## Goals

- Measure prompt quality with comparable metrics across runs.
- Learn from small experiments while still producing useful enrichment data.
- Assimilate evidence progressively into structured artifacts instead of losing it in prose summaries.
- Separate research, experiment evaluation, graph assimilation, and public promotion.
- Scale only after the prompt proves it can produce high-quality evidence with low waste.

## Core Loop

Every enrichment run should follow this loop:

1. **Observe**: Read prior artifacts, rejected candidates, public entries, open questions, source patterns, and known failure modes.
2. **Hypothesize**: State what prompt behavior should improve, such as fewer duplicate identities or better product-photo attribution.
3. **Experiment**: Run a small, stratified batch where the output is useful even if the prompt variant loses.
4. **Assimilate**: Convert results into atomic evidence, decisions, coverage gaps, source reliability notes, and prompt feedback.
5. **Decide**: Keep, revise, or discard the prompt change using metrics, not subjective feel.
6. **Scale**: Increase batch size only for prompt variants that meet precision and efficiency thresholds.

The point is not to find a perfect prompt in isolation. The point is to make every run add reusable evidence and reduce uncertainty.

## Measurement Units

Use these units consistently so results can be compared later:

- `promptVariant`: A specific prompt version with a stable ID, explicit changes, and a hypothesis.
- `experiment`: One comparison or test of a prompt behavior.
- `run`: One produced artifact from one prompt variant against one batch.
- `candidate`: The raw backlog item or fresh discovery being evaluated.
- `entity`: The real-world place, person, object, source, or item after identity resolution.
- `evidenceClaim`: One atomic statement a source proves, such as exact address, current operation, product relevance, or photo attribution.
- `decision`: Pass, reject, open, already public, duplicate, outside bounds, or needs manual review.
- `coverageCell`: A geography, subtopic, era, style, price band, audience segment, or other topic-specific slice.

## Required Metrics

Each run artifact should include `runMetrics` with these fields.

### Quality Metrics

- `publicReadyPassRate`: Passed candidates that satisfy all public gates divided by researched candidates.
- `falsePassRate`: Passed candidates later reversed by review divided by passed candidates.
- `evidenceCompletenessRate`: Candidates with exact address, coordinates, current signal, relevance proof, and required media proof divided by candidates researched.
- `photoAttributionCompletenessRate`: Product photos with parent page, direct URL if available, visible credit, caption/alt text, and product description divided by product photos used.
- `manualReviewRate`: Passed candidates needing human review for rights, attribution, composite images, scope, or ambiguous identity divided by passed candidates.

### Efficiency Metrics

- `candidatesPerHour`: Researched candidates divided by elapsed research time, when available.
- `sourcesPerDecision`: Source URLs checked divided by final decisions.
- `repeatWorkRate`: Candidates or source checks already resolved in prior artifacts divided by candidates or source checks attempted.
- `earlyStopRate`: Candidates rejected at the first hard failed gate divided by rejected candidates.
- `usefulRejectRate`: Rejections with specific checked sources and a concrete next action divided by rejected candidates.

### Coverage Metrics

- `coverageCellTouchRate`: Coverage cells with at least one researched candidate divided by target coverage cells.
- `coverageCellPassRate`: Coverage cells with at least one passed candidate divided by target coverage cells.
- `novelEntityRate`: Passed or open entities not already public and not already resolved in prior artifacts divided by researched candidates.
- `outsideScopeLeadRate`: Evidence-backed entities outside current bounds or topic scope divided by passed plus open entities.

### Prompt Behavior Metrics

- `schemaValidity`: Whether the artifact validates as JSON and contains required top-level sections.
- `gateOrderCompliance`: Whether the run records failures in identity, address, coordinate, current signal, relevance, and media order.
- `sourceDiversity`: Count of distinct useful source types, such as official site, official social, map listing, local press, review gallery, tourism/chamber page.
- `promptFeedbackSpecificity`: Count of actionable prompt-change recommendations with concrete wording.

## Model Routing

Live benchmarking on 2026-05-29 showed that broad Northeast prompts waste model effort and increase geography drift. Non-reasoning Grok performs better when it receives a narrow target cluster plus named anchor items, such as a Portland, Maine peninsula cluster with 2-4 candidate shop names. Multi-agent Grok can surface stronger candidates from the same cluster, but it is materially more expensive and more likely to overstate photo attribution unless the prompt explicitly requires exact photo-owner credit.

Use this routing pattern:

- `grok-4.20-0309-non-reasoning`: first-pass cluster pruning and conservative rejection; give it one tight location cluster and concrete anchor items.
- `grok-4.20-multi-agent`, `reasoning.effort=low`: follow-up on clusters where non-reasoning finds promising but unresolved entries; expect higher latency, more tool calls, and better recall.
- `grok-4.20-multi-agent`, `reasoning.effort=high` or `xhigh`: reserve for expensive deep dives after a cluster demonstrates likely yield.

Prompt requirement added from the same run: never call a social image "official" unless the account/page is clearly owned by the business. Customer, influencer, Yelp, Google, Tripadvisor, or press photos must be credited to the exact source and marked for manual review unless the page itself ties the visible product to the exact location.

## Experiment Design

Experiments should be small enough to review and large enough to teach. Default to 10-20 candidates per run.

Each experiment needs:

- `hypothesis`: The prompt change and expected measurable effect.
- `controlPromptVariant`: The current baseline prompt.
- `testPromptVariant`: The new prompt variant.
- `batchDesign`: How candidates were selected and stratified.
- `successCriteria`: Metrics required to keep the prompt change.
- `failureCriteria`: Metrics or observed behaviors that reject the change.
- `reviewPlan`: What humans or scripts will check after the run.
- `scalePlan`: What happens if the experiment wins.

Use paired or stratified experiments where possible:

- **Paired batch**: Run two prompt variants on the same 10 candidates. Best for source-order, schema, or gate wording tests.
- **Stratified batch**: Run one prompt over a balanced batch, such as two candidates per county or two per subtopic. Best for coverage tests.
- **Holdout review**: Reserve 10-20% of passed candidates for manual audit before public promotion. Best for measuring false passes.
- **Hard-negative set**: Include known chains, stale entities, duplicates, and storefront-only galleries. Best for testing whether the prompt rejects correctly.

## High-Value Prompt Permutations

Test one or two axes at a time. Avoid changing the entire prompt and then being unable to explain what worked.

### Geography Strategy

- Backlog order vs county-by-county grid.
- Radial distance buckets vs administrative regions.
- Core bounds only vs core plus expansion leads.
- Dense city first vs underserved coverage cells first.

Expected learning: whether the prompt improves coverage without lowering precision.

### Candidate Seed Strategy

- Rejected backlog only.
- Public map gap analysis first, then backlog.
- Fresh discovery allowed but labeled.
- Source-led discovery from local press, tourism pages, chambers, and map galleries.

Expected learning: whether fresh discovery produces better candidates than trying to repair weak backlog rows.

### Source Order

- Official site first, then map/review galleries.
- Identity via map listing first, then official site.
- Local press first for exceptional status, then official verification.
- Gallery-first after identity is fixed.

Expected learning: which order reduces wasted source checks and increases photo proof.

### Media Gate Strictness

- Proof-only photos allowed with manual-review flag.
- Public-display-ready photos required for pass.
- Composite gallery images rejected outright.
- Composite images accepted as proof but never public display.

Expected learning: how much yield drops when image policy becomes stricter.

### Rejection Taxonomy

- Minimal fixed rejection reasons.
- Fixed reasons plus `failedGate`.
- Fixed reasons plus source-specific next action.
- Fixed reasons plus graph update operations.

Expected learning: whether more structured rejection data reduces repeat work in future runs.

### Prompt Feedback Shape

- Freeform feedback.
- Required `whatWorked`, `whatFailed`, and `recommendedPromptChanges`.
- Required metric-backed feedback.
- Required reusable topic-generalization block.

Expected learning: whether feedback becomes reusable across topics or remains tied to one run.

## Progressive Assimilation Graph

Do not wait for a database. Start by storing graph-shaped data in JSON artifacts. It can be reorganized later.

The goal is progressive assimilation: every run should make the next run smarter by adding structured facts, not just final candidates.

### Node Types

- `Topic`: The map topic or niche, such as `ice_cream_capital_district`.
- `CoverageCell`: A county, neighborhood, distance band, product subtype, era, style, or other topic slice.
- `Candidate`: A raw input item from a backlog, batch, or fresh discovery.
- `Entity`: The resolved real-world item.
- `Location`: Exact address and coordinates.
- `Source`: Official site, map listing, review gallery, article, menu, social post, or directory page.
- `EvidenceClaim`: Atomic proof extracted from a source.
- `PhotoEvidence`: A product/media proof record with attribution.
- `PromptVariant`: The prompt version used.
- `Run`: The artifact that generated decisions.
- `Decision`: Pass, reject, open, duplicate, already public, outside bounds, or manual review.
- `OpenQuestion`: A specific unresolved uncertainty.

### Edge Types

- `researchedIn`: Candidate or entity was evaluated in a run.
- `resolvedTo`: Candidate maps to a real entity.
- `sameAs`: Two candidates or entities appear to be the same real-world item.
- `locatedAt`: Entity has a location.
- `cites`: Evidence claim cites a source.
- `proves`: Source or evidence claim proves a gate.
- `failsGate`: Candidate or entity failed a specific gate.
- `hasPhotoEvidence`: Entity has product media evidence.
- `covers`: Entity contributes to a coverage cell.
- `outsideScopeFor`: Entity is valid but outside a map scope or coordinate contract.
- `suggestsNextAction`: Rejection or open question points to a next action.

### Minimal Graph Payload

Add this optional block to future enrichment artifacts:

```json
{
  "assimilation": {
    "graphVersion": "0.1",
    "nodes": [
      {
        "id": "entity:the-grandstand-schenectady",
        "type": "Entity",
        "label": "The Grandstand",
        "confidence": "high"
      }
    ],
    "edges": [
      {
        "from": "entity:the-grandstand-schenectady",
        "to": "coverage:schenectady-county",
        "type": "covers",
        "confidence": "high",
        "sourceRun": "run:ice-cream-capital-district-county-deep-dive-2026-05-29T04-46-58Z"
      }
    ],
    "claims": [
      {
        "id": "claim:the-grandstand-current-operation",
        "entityId": "entity:the-grandstand-schenectady",
        "gate": "current_operation",
        "claim": "Restaurantji lists a May 27, 2026 update and current hours for The Grandstand.",
        "sourceUrl": "https://www.restaurantji.com/ny/schenectady/the-grandstand-/",
        "confidence": "high",
        "observedAt": "2026-05-29"
      }
    ]
  }
}
```

This structure is intentionally simple. It can later become JSONL, SQLite, RDF, a property graph, or a search index without changing the research philosophy.

## Artifact Additions

Future run artifacts should preserve the existing `passed`, `rejected`, and `openQuestions` shape, then add these top-level sections:

```json
{
  "experiment": {
    "id": "ice-cream-source-order-001",
    "hypothesis": "Starting with map/gallery pages after identity verification increases two-photo pass rate without increasing false passes.",
    "promptVariant": "prompt:ice-cream-v0.4-gallery-after-identity",
    "controlPromptVariant": "prompt:ice-cream-v0.3-official-first",
    "batchDesign": "Paired 12-candidate batch: 3 core counties, 3 expansion counties, 3 known weak backlog rows, 3 fresh discoveries.",
    "successCriteria": [
      "photoAttributionCompletenessRate >= 0.8",
      "falsePassRate == 0 after manual review",
      "repeatWorkRate <= 0.15"
    ],
    "decision": "pending"
  },
  "runMetrics": {
    "candidatesResearched": 12,
    "passedCount": 0,
    "rejectedCount": 0,
    "openCount": 0,
    "manualReviewCount": 0,
    "coverageCellsTouched": [],
    "sourceTypeCounts": {},
    "failedGateCounts": {}
  },
  "assimilation": {
    "graphVersion": "0.1",
    "nodes": [],
    "edges": [],
    "claims": []
  }
}
```

## Prompt Requirements For Progressive Assimilation

Every research prompt should include language like this:

```text
You are producing an enrichment artifact and an experiment artifact.

Do not only report final candidates. Preserve reusable research state.

For every candidate, emit:
1. The original candidate ID and the resolved entity ID if different.
2. The first failed gate, if rejected.
3. Atomic evidence claims for address, coordinates, current operation, relevance, and media proof.
4. Source records with parent URL, source type, observed date, and what the source proved.
5. Photo records with parent page URL, direct image URL when available, visible attribution, caption/alt text, product visible, actual-place cues, and whether it is proof-only or public-display-ready.
6. Coverage cells touched, such as county, neighborhood, subtype, era, or other map-specific segment.
7. Graph nodes and edges that future runs can reuse.
8. Prompt feedback tied to observed failures and metric changes.

If a candidate fails, stop at the first hard gate when appropriate, but still record the source checked and the next best action.

If the data already exists in prior artifacts, reference the prior artifact instead of re-researching unless the experiment explicitly tests recency or source freshness.
```

## Decision Rules

Use explicit rules to decide whether a prompt variant advances.

Keep a prompt change when:

- JSON/schema validity is 100%.
- False passes are zero in manual review.
- Rejections include specific failed gates and next actions at least 90% of the time.
- Photo attribution completeness improves or stays above threshold.
- Coverage improves without lowering public-ready precision.
- Repeat work decreases or remains acceptably low.

Revise a prompt change when:

- It finds useful data but produces ambiguous manual-review burdens.
- It improves yield but fails to classify scope, bounds, or photo rights cleanly.
- It works for one source ecosystem but generalizes poorly to another.

Discard a prompt change when:

- It promotes unverifiable candidates.
- It confuses candidates and resolved entities.
- It increases duplicate work.
- It produces source URLs without stating what each source proves.
- It cannot be reviewed quickly by a human.

## Scaled Execution Plan

Scale in stages.

### Stage 0: Manual Baseline

- Run 10-20 candidates with the current prompt.
- Record `runMetrics`, `promptFeedback`, and `assimilation`.
- Manually audit every pass.

Exit criteria: artifact schema is stable and manual review can evaluate it quickly.

### Stage 1: Paired Experiments

- Run two prompt variants on the same small batch.
- Compare pass precision, useful rejection rate, source checks, and photo attribution.
- Keep the better behavior, not necessarily the higher pass count.

Exit criteria: one variant wins on precision and review efficiency.

### Stage 2: Stratified Coverage Waves

- Run by coverage cell, such as county, neighborhood, subtype, or era.
- Include hard negatives and known duplicates in each wave.
- Produce useful rejections and graph updates even when no candidate passes.

Exit criteria: coverage gaps are visible and repeat work drops.

### Stage 3: GitHub Actions Batch Lane

- Use the winning prompt variant in GitHub-native research agents.
- Write artifacts only.
- Do not edit public map entries from the research lane.
- Run validation and source-verification scripts on artifacts.

Exit criteria: artifacts are consistently reviewable and stable under larger batches.

### Stage 4: Promotion Review

- Promote only reviewed, schema-valid, bounds-valid, photo-policy-valid entries.
- Keep proof-only sources in enrichment artifacts unless public display rights are settled.
- Record which graph claims became public entries.

Exit criteria: public data stays clean and failed candidates remain useful for future waves.

## First Experiments To Run

1. **County Grid vs Backlog Order**
   - Hypothesis: County grid selection improves coverage and reduces repeat work.
   - Batch: 16 candidates, two per county across core and expansion counties.
   - Success: More coverage cells touched with no false passes.

2. **Gallery After Identity vs Official-First**
   - Hypothesis: Once identity is fixed, map/review galleries improve photo evidence yield.
   - Batch: Same 12 candidates, paired prompt run.
   - Success: Higher two-photo proof rate without weaker attribution.

3. **Composite Proof Policy**
   - Hypothesis: Allowing composites as proof-only increases useful leads without polluting public display candidates.
   - Batch: 10 candidates known to have Restaurantji or directory composites.
   - Success: Manual-review flags are accurate and no composite is marked public-display-ready.

4. **Fresh Discovery Labeling**
   - Hypothesis: Allowing fresh discoveries improves yield if corrected entities and original bad candidates remain separate.
   - Batch: 10 weak backlog rows where identity mismatch is likely.
   - Success: Zero silent corrections and all fresh discoveries have `freshDiscovery: true`.

5. **Hard Negative Rejection**
   - Hypothesis: Explicit blocked-source and blocked-chain wording reduces wasted research.
   - Batch: 10 known chains, convenience stores, stale entities, and storefront-only candidates.
   - Success: At least 90% rejected at the first hard gate with specific reasons.

## Practical Rule

Treat each prompt as a data collection instrument. A good prompt does not just answer the immediate question. It preserves enough structured evidence, failed gates, and coverage state that the next run can spend less time relearning and more time adding new value.
