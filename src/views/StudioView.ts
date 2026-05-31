import { loadEnrichmentBacklog, loadEntries, loadIndex, loadPublicHunts, loadResearchBatch, loadResearchBatchIndex } from '../lib/data-loader'
import { clearStoredHuntKey, getStudioEnrichmentJob, refineHunt, requestStudioEnrichment, submitStudioReviewAction } from '../lib/assistant'
import type { KnowledgeEntry, MapSummary, ResearchBatch } from '../types'
import type { DraftMap, HuntProfile } from '../types/hunt'
import type { StudioEnrichmentJob, StudioEnrichmentJobKind, StudioReviewActionPayload, StudioReviewActionType } from '../types/studio-review'

interface ReviewFlag {
  mapSlug: string
  mapTitle: string
  entryId: string
  entryName: string
  city: string
  confidence: string
  priorityScore: number
  issues: string[]
}

type QueueState = 'Verification Queue' | 'Needs Photo Review' | 'Refinement Requested'

interface ReviewItem extends ReviewFlag {
  queueState: QueueState
  entry: KnowledgeEntry | null
}

const QUEUE_STATES: QueueState[] = ['Verification Queue', 'Needs Photo Review', 'Refinement Requested']

interface PublicHuntRow {
  profile: HuntProfile
  draftMap: DraftMap | null
}

export default class StudioView {
  async mount(container: HTMLElement) {
    container.innerHTML = `
      <div class="studio-shell p-4 sm:p-6 mx-auto">
        <div class="mb-5">
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">CURATION STUDIO</div>
          <h1 class="text-2xl font-semibold tracking-tight text-[#e4e4e7]">Curation Dashboard</h1>
        </div>
        <div class="animate-pulse text-sm text-[#6b6761]">Loading maps, Hunts, and review queues...</div>
      </div>
    `

    const [mapIndexResult, batchIndexResult, publicHuntsResult] = await Promise.all([
      loadIndex(),
      loadResearchBatchIndex(),
      loadPublicHunts(),
    ])

    const batches = await Promise.all(
      (batchIndexResult.data?.batches || []).map(async summary => {
        const result = await loadResearchBatch(summary.file)
        return { summary, batch: result.data }
      })
    )
    const maps = mapIndexResult.data?.maps || []
    const hunts = publicHuntsResult.data?.hunts || []

    const backlogResult = await loadEnrichmentBacklog()
    const backlog = backlogResult.data
    const isMobile = window.matchMedia('(max-width: 1023px)').matches
    const topFlags = (backlog?.backlog || []) as ReviewFlag[]
    const entryLookup = await this.loadFlaggedEntryLookup(topFlags)
    const reviewItems = topFlags.map(flag => ({
      ...flag,
      queueState: this.classifyQueueState(flag),
      entry: entryLookup.get(this.reviewKey(flag)) || null,
    }))
    const approvedBatches = batches
      .filter(({ summary }) => /complete|committed|approved|published/i.test(summary.status))
      .slice(0, 4)

    container.innerHTML = `
      <div class="studio-shell flex flex-col gap-5 p-4 sm:p-6 mx-auto">
        <div class="mb-5 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">CURATION STUDIO</div>
            <h1 class="text-3xl font-semibold tracking-tight text-[#e4e4e7]">Curation Dashboard</h1>
            <p class="mt-1 max-w-3xl text-sm text-[#a1a1aa]">Committed maps are public. Hunt drafts and review queues are provisional until promoted through validation.</p>
          </div>
          <button type="button" class="studio-secondary-link studio-key-control" data-clear-curator-key>Change curator key</button>
        </div>

        <div class="studio-mobile-pane-switcher" data-mobile-pane-switcher aria-label="Studio panes">
          <button type="button" class="studio-pane-tab is-active" data-studio-pane-tab="review" aria-pressed="true">Review</button>
          <button type="button" class="studio-pane-tab" data-studio-pane-tab="maps" aria-pressed="false">Maps</button>
          <button type="button" class="studio-pane-tab" data-studio-pane-tab="batches" aria-pressed="false">Batches</button>
        </div>

        ${this.renderMobileWorkflowSummary()}

        ${this.renderMobileOverview(maps, approvedBatches)}

        ${this.renderReviewWorkspace(reviewItems, approvedBatches, backlog, maps, isMobile)}

        ${this.renderStudioOverview(maps, hunts, publicHuntsResult.error, reviewItems, mapIndexResult.error)}

        ${this.renderBatchesSection(batches, batchIndexResult.error)}
      </div>
    `

    this.bindStudioActions(container, reviewItems)
  }

  private async loadFlaggedEntryLookup(flags: ReviewFlag[]) {
    const lookup = new Map<string, KnowledgeEntry>()
    const slugs = Array.from(new Set(flags.map(flag => flag.mapSlug)))

    await Promise.all(slugs.map(async slug => {
      const result = await loadEntries(slug)
      for (const entry of result.data || []) {
        lookup.set(`${slug}:${entry.id}`, entry)
      }
    }))

    return lookup
  }

  private renderStudioOverview(
    maps: MapSummary[],
    hunts: PublicHuntRow[],
    huntError: string | undefined,
    reviewItems: ReviewItem[],
    mapError: string | undefined
  ) {
    const reviewCounts = this.reviewCountsByMap(reviewItems)
    const liveHunts = hunts
      .filter(row => !/^hunt-smoke-|^hunt-queue-smoke-/i.test(row.profile.id))
      .slice(0, 6)

    return `
      <section class="studio-pane" data-studio-pane="maps">
        <div class="studio-panel p-4 sm:p-5">
          <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
            <div>
              <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">PUBLIC MAPS</div>
              <h2 class="text-xl font-semibold text-[#e4e4e7]">Committed maps</h2>
              <p class="mt-1 text-sm text-[#a1a1aa]">These are the maps currently published from committed public/data JSON. Veal parm is here; it was not wiped out.</p>
            </div>
            <a class="studio-primary-link" href="${this.appHref('/')}">Open gallery</a>
          </div>

          ${maps.length > 0 ? `
            <div class="studio-map-grid">
              ${maps.map(map => this.renderMapSummaryCard(map, reviewCounts.get(map.slug) || 0)).join('')}
            </div>
          ` : `
            <div class="rounded border border-[#27272a] p-3 text-sm text-[#7a2f24] dark:text-[#ffb4a8]">
              Public map index did not load${mapError ? `: ${this.escape(mapError)}` : '.'}
            </div>
          `}
        </div>

        <div class="studio-panel p-4 sm:p-5">
          <div class="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-3 mb-4">
            <div>
              <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">LIVE HUNT DRAFTS</div>
              <h2 class="text-xl font-semibold text-[#e4e4e7]">Netlify provisional queue</h2>
              <p class="mt-1 text-sm text-[#a1a1aa]">Draft Hunts appear here only while they live in Netlify Blobs. They do not replace committed maps.</p>
            </div>
          </div>

          ${liveHunts.length > 0 ? `
            <div class="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              ${liveHunts.map(row => this.renderHuntDraftCard(row)).join('')}
            </div>
          ` : `
            <div class="rounded border border-[#27272a] p-3 text-sm text-[#a1a1aa]">
              ${huntError ? `Hunt service is unavailable in this environment: ${this.escape(huntError)}` : 'No provisional Hunt drafts are queued right now.'}
            </div>
          `}
        </div>
      </section>
    `
  }

  private renderMapSummaryCard(map: MapSummary, reviewCount: number) {
    const vealHighlight = /veal-parm/.test(map.slug)
    return `
      <article class="studio-map-card ${vealHighlight ? 'studio-map-card-highlight' : ''}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h3 class="text-base font-bold text-[#e4e4e7]">${this.escape(map.title)}</h3>
            <p class="mt-1 text-sm leading-relaxed text-[#a1a1aa]">${this.escape(map.tagline)}</p>
          </div>
          <span class="studio-count-pill">${map.entryCount}</span>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          <a class="studio-secondary-link" href="${this.appHref(`/map/${map.slug}`)}">Open map</a>
          ${reviewCount > 0 ? `<button type="button" class="studio-secondary-link" data-map-filter="${this.escapeAttr(map.slug)}">${reviewCount} review items</button>` : ''}
        </div>
      </article>
    `
  }

  private renderHuntDraftCard(row: PublicHuntRow) {
    const entries = row.draftMap?.entries.length || 0
    return `
      <article class="rounded border border-[#27272a] p-3 bg-[#17171a]">
        <div class="text-[11px] uppercase tracking-[1px] font-bold text-[#a1a1aa]">${this.escape(row.profile.status)}</div>
        <h3 class="mt-1 text-base font-bold text-[#e4e4e7]">${this.escape(row.profile.spec.title)}</h3>
        <p class="mt-1 text-sm leading-relaxed text-[#a1a1aa]">${this.escape(row.profile.spec.intent)}</p>
        <div class="mt-3 flex flex-wrap gap-2 text-xs">
          <span class="studio-count-pill">${entries} draft entries</span>
          <a class="studio-secondary-link" href="${this.appHref(`/hunts/${row.profile.id}`)}">Open draft</a>
        </div>
      </article>
    `
  }

  private renderReviewWorkspace(
    items: ReviewItem[],
    approvedBatches: Array<{ summary: any; batch: ResearchBatch | null }>,
    backlog: { generatedAt: string; totalFlaggedEntries: number; totalMaps: number } | null,
    maps: MapSummary[],
    isMobile = false
  ) {
    const orderedItems = QUEUE_STATES.flatMap(state => items.filter(item => item.queueState === state))
    const firstKey = orderedItems[0] ? this.reviewKey(orderedItems[0]) : ''

    return `
      <section class="studio-pane studio-pane-review mb-5" data-review-workspace data-studio-pane="review">
        <div class="studio-panel studio-review-workspace p-4 sm:p-5">
          <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa]">QUALITY REVIEW QUEUE</div>
              <h2 class="text-xl font-semibold text-[#e4e4e7]">Entries needing curator attention</h2>
              <div class="text-sm text-[#e4e4e7]">
                ${backlog ? `${backlog.totalFlaggedEntries} flagged entries across ${backlog.totalMaps} maps` : 'No backlog index loaded yet'}
              </div>
            </div>
            <div class="text-xs text-[#a1a1aa]">
              ${backlog ? `Generated ${new Date(backlog.generatedAt).toLocaleString()}` : 'Artifact-only actions; no runtime backend'}
            </div>
          </div>

          ${this.renderMapFilterBar(items, maps)}

          ${isMobile ? '' : `
            <div class="mt-5 grid gap-3 md:grid-cols-3" data-studio-workflow>
              ${this.workflowStep('1', 'Select a card', 'Pick the entry that needs verification, photo review, or refinement.', true)}
              ${this.workflowStep('2', 'Inspect the preview', 'Check the profile, evidence, sources, photos, and exact location before deciding.')}
              ${this.workflowStep('3', 'Submit next stage', 'Send the action to the protected Studio queue; copy remains available as a fallback.')}
            </div>
          `}

          <div class="studio-review-content mt-5 grid gap-5 xl:grid-cols-[minmax(320px,0.78fr)_minmax(0,1.4fr)] xl:items-stretch xl:h-[calc(100vh-18rem)] xl:min-h-[42rem]">
            <div class="studio-list-panel studio-review-list-shell">
              <div class="studio-list-header">
                <div class="text-base font-bold text-[#f4f4f5]">Review List</div>
                <div class="text-xs text-[#b8b2a8]">${items.length} queued items shown by priority</div>
              </div>
              <div class="studio-review-list-scroll">
                ${orderedItems.length > 0 ? QUEUE_STATES.map(state => this.renderQueueGroup(state, orderedItems, firstKey)).join('') : `
                  <div class="p-4 text-sm text-[#a1a1aa]">No review items are currently queued.</div>
                `}
              </div>
            </div>

            <div class="grid gap-3 h-full min-h-0 xl:grid-rows-[minmax(0,1fr)_auto]">
              <div class="studio-preview-panel studio-preview-scroll min-h-0">
                ${orderedItems.length > 0 ? orderedItems.map((item, index) => this.renderPreviewPanel(item, index === 0)).join('') : this.renderEmptyPreview()}
              </div>

              <div class="studio-list-panel p-3">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-3">
                  <div>
                    <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa]">Generated Review Action</div>
                    <div class="text-xs text-[#a1a1aa]">Actions below the preview generate an auditable payload. Choose whether to run it live as provisional work or hold it for a batch pass.</div>
                  </div>
                  <div class="flex flex-wrap gap-2">
                    <button type="button" class="studio-action-primary disabled:opacity-45" data-submit-payload disabled>Submit action</button>
                    <button type="button" class="studio-action-secondary disabled:opacity-45" data-copy-payload disabled>Copy payload</button>
                    <button type="button" class="studio-action-secondary disabled:opacity-45" data-clear-payload disabled>Clear</button>
                  </div>
                </div>
                <label class="block text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2" for="studio-note">Curator note</label>
                <textarea id="studio-note" class="studio-note-field" rows="3" placeholder="Add a reason, rejection note, or prompt guidance update. Example: rejected because this is not pizza; Friendly's is a chain."></textarea>
                <fieldset class="studio-action-mode mt-3" aria-label="Action mode">
                  <legend class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Action mode</legend>
                  <label class="studio-action-mode-option">
                    <input type="radio" name="studio-action-mode" value="live" checked>
                    <span>
                      <strong>Live provisional</strong>
                      <small>Run through Netlify now; still not public data.</small>
                    </span>
                  </label>
                  <label class="studio-action-mode-option">
                    <input type="radio" name="studio-action-mode" value="batch">
                    <span>
                      <strong>Batch promotion</strong>
                      <small>Hold for a grouped GitHub validation/promote pass.</small>
                    </span>
                  </label>
                </fieldset>
                <div class="mt-2 flex flex-wrap gap-2">
                  <button type="button" class="studio-action-secondary" data-refine-guidance disabled>Refine with Grok</button>
                </div>
                <div id="studio-guidance-status" class="mt-2 text-xs text-[#a1a1aa]"></div>
                <pre id="studio-action-payload" class="studio-payload-preview" data-empty="true">Choose a next-stage action from the selected preview.</pre>
                <div id="studio-action-status" class="mt-2 text-xs text-[#a1a1aa]"></div>
              </div>
            </div>
          </div>

          ${this.renderApprovedSummary(approvedBatches)}
        </div>
      </section>
    `
  }

  private renderBatchesSection(batches: Array<{ summary: any; batch: ResearchBatch | null }>, error?: string) {
    return `
      <section class="studio-pane" data-studio-pane="batches">
        <div class="grid gap-4 mt-5">
          <div>
            <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">RESEARCH BATCHES</div>
            <h2 class="text-xl font-semibold text-[#e4e4e7]">Static batch artifacts</h2>
          </div>
          ${batches.length > 0 ? batches.map(({ summary, batch }) => this.renderBatch(summary, batch)).join('') : `
            <div class="studio-panel p-4 text-sm text-[#a1a1aa]">
              ${error ? `Research batch index did not load: ${this.escape(error)}` : 'No static research batches are currently committed.'}
            </div>
          `}
        </div>
      </section>
    `
  }

  private renderMobileOverview(maps: MapSummary[], approvedBatches: Array<{ summary: any; batch: ResearchBatch | null }>) {
    const vealMap = maps.find(map => /veal-parm/.test(map.slug))
    const mapTeasers = [
      ...maps.slice(0, 3),
      ...(vealMap && !maps.slice(0, 3).some(map => map.slug === vealMap.slug) ? [vealMap] : []),
    ]
    const batchTeasers = approvedBatches.slice(0, 2)

    return `
      <div class="studio-mobile-overview">
        <section class="studio-mobile-overview-card">
          <h2 class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa]">Committed maps</h2>
          <div class="mt-2 grid gap-2">
            ${mapTeasers.map(map => `
              <div class="studio-mobile-overview-item">
                <h3 class="text-sm font-bold text-[#e4e4e7]">${this.escape(map.title)}</h3>
                <div class="text-xs text-[#a1a1aa]">${this.escape(map.tagline)}</div>
              </div>
            `).join('')}
          </div>
        </section>

        <section class="studio-mobile-overview-card">
          <h2 class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa]">Static batch artifacts</h2>
          <div class="mt-2 grid gap-2">
            ${batchTeasers.length > 0 ? batchTeasers.map(({ summary, batch }) => `
              <div class="studio-mobile-overview-item">
                <h3 class="text-sm font-bold text-[#e4e4e7]">${this.escape(summary.name)}</h3>
                <div class="text-xs text-[#a1a1aa]">${this.escape(summary.status)} / ${batch?.summary.totalProfiles ?? summary.totalProfiles} profiles</div>
              </div>
            `).join('') : `
              <div class="studio-mobile-overview-item text-sm text-[#a1a1aa]">No static research batches are currently committed.</div>
            `}
          </div>
        </section>
      </div>
    `
  }

  private renderMobileWorkflowSummary() {
    return `
      <section class="studio-mobile-workflow">
        <div class="studio-mobile-workflow-item">
          <div class="text-[10px] uppercase tracking-[1px] font-bold text-[#a1a1aa]">1</div>
          <div class="text-sm font-bold text-[#f4f4f5]">Select a card</div>
        </div>
        <div class="studio-mobile-workflow-item">
          <div class="text-[10px] uppercase tracking-[1px] font-bold text-[#a1a1aa]">2</div>
          <div class="text-sm font-bold text-[#f4f4f5]">Inspect the preview</div>
        </div>
        <div class="studio-mobile-workflow-item">
          <div class="text-[10px] uppercase tracking-[1px] font-bold text-[#a1a1aa]">3</div>
          <div class="text-sm font-bold text-[#f4f4f5]">Submit next stage</div>
        </div>
      </section>
    `
  }

  private workflowStep(number: string, title: string, copy: string, active = false) {
    return `
      <div class="studio-workflow-step ${active ? 'is-active' : ''}" data-workflow-step="${number}">
        <div class="flex items-center gap-2">
          <span class="studio-step-index">${number}</span>
          <div class="text-sm font-bold text-[#f4f4f5]">${title}</div>
        </div>
        <div class="mt-2 text-xs leading-relaxed text-[#b8b2a8]">${copy}</div>
      </div>
    `
  }

  private renderMapFilterBar(items: ReviewItem[], maps: MapSummary[]) {
    const counts = this.reviewCountsByMap(items)
    const orderedSlugs = [
      ...maps.map(map => map.slug).filter(slug => counts.has(slug)),
      ...Array.from(counts.keys()).filter(slug => !maps.some(map => map.slug === slug)),
    ]

    if (orderedSlugs.length === 0) return ''

    const titleForSlug = (slug: string) => maps.find(map => map.slug === slug)?.title || items.find(item => item.mapSlug === slug)?.mapTitle || slug

    return `
      <div class="mt-5 studio-scope-filter">
        <div class="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
          <div>
            <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa]">Scope filter</div>
            <div class="text-sm text-[#a1a1aa]">Filter the queue by map. Use this to jump directly to veal parm, ice cream, or any other topic.</div>
          </div>
          <button type="button" class="studio-filter-chip" data-map-filter="all" aria-pressed="true">All ${items.length}</button>
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          ${orderedSlugs.map(slug => `
            <button type="button" class="studio-filter-chip" data-map-filter="${this.escapeAttr(slug)}" aria-pressed="false">
              ${this.escape(this.compactMapTitle(titleForSlug(slug)))} <span>${counts.get(slug)}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `
  }

  private renderQueueGroup(state: QueueState, items: ReviewItem[], selectedKey: string) {
    const groupItems = items.filter(item => item.queueState === state)

    return `
      <section class="studio-queue-section" data-queue-section="${state}">
        <div class="studio-queue-heading">
          <h2 class="text-xs uppercase tracking-[1.2px] font-black text-[#d6d3cc]">${state}</h2>
          <span class="studio-subtle-count">${groupItems.length}</span>
        </div>
        <div class="grid">
          ${groupItems.length > 0 ? groupItems.map(item => this.renderQueueItem(item, selectedKey)).join('') : `
            <div class="p-3 text-sm text-[#a1a1aa]">${this.emptyCopyForState(state)}</div>
          `}
        </div>
      </section>
    `
  }

  private renderQueueItem(item: ReviewItem, selectedKey: string) {
    const key = this.reviewKey(item)
    return `
      <button type="button" class="studio-review-card text-left"
        data-review-card
        data-review-key="${this.escapeAttr(key)}"
        data-map-slug="${this.escapeAttr(item.mapSlug)}"
        aria-pressed="${key === selectedKey ? 'true' : 'false'}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold text-sm text-[#e4e4e7]">${this.escape(item.entryName)}</div>
            <div class="text-xs text-[#a1a1aa]">${this.escape(item.mapTitle)} / ${this.escape(item.city)}</div>
          </div>
          <div class="text-[11px] px-2 py-0.5 rounded bg-[#c9a86c] text-[#0f0f11]">${item.priorityScore}</div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          ${item.issues.slice(0, 3).map(issue => `<span class="text-[11px] px-2 py-0.5 rounded bg-[#1f1d1a] text-[#e4e4e7]">${this.escape(this.formatIssueLabel(item, issue))}</span>`).join('')}
        </div>
      </button>
    `
  }

  private renderPreviewPanel(item: ReviewItem, selected: boolean) {
    const key = this.reviewKey(item)
    const entry = item.entry
    const mapDetailHref = this.appHref(`/map/${item.mapSlug}?entry=${encodeURIComponent(item.entryId)}`)

    return `
      <article class="studio-review-preview p-5 sm:p-6" data-review-preview data-review-key="${this.escapeAttr(key)}" data-map-slug="${this.escapeAttr(item.mapSlug)}" ${selected ? '' : 'hidden'}>
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 studio-preview-header">
          <div>
            <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa]">${this.escape(item.queueState)}</div>
            <h2 class="text-xl font-bold text-[#e4e4e7]">${this.escape(entry?.name || item.entryName)}</h2>
            <div class="text-sm text-[#a1a1aa]">${this.escape(this.locationLine(entry, item))}</div>
          </div>
          <a class="studio-action-secondary" href="${mapDetailHref}">Open map detail</a>
        </div>

        <div class="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div class="grid gap-5">
            <section>
              <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">What to Assess</div>
              <ul class="grid gap-2 text-sm text-[#e4e4e7]">
                ${this.assessmentChecklist(item).map(check => `<li class="studio-assessment-item">${this.escape(check)}</li>`).join('')}
              </ul>
            </section>

            <section>
              <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Profile Preview</div>
              <p class="text-sm leading-relaxed text-[#e4e4e7]">${this.escape(entry?.description || 'No entry profile was found for this queue item.')}</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                ${this.previewFact('Confidence', entry?.confidence || item.confidence)}
                ${this.previewFact('Address', entry?.location.address || 'Address review needed')}
                ${this.previewFact('Coordinates', entry ? `${entry.location.lat}, ${entry.location.lng}` : 'Coordinate review needed')}
                ${this.previewFact('Map', item.mapTitle)}
              </div>
              ${entry?.tags?.length ? `
                <div class="mt-3 flex flex-wrap gap-1.5">
              ${entry.tags.map(tag => `<span class="studio-soft-tag">${this.escape(tag)}</span>`).join('')}
                </div>
              ` : ''}
            </section>

            ${this.renderEvidencePreview(entry)}
            ${this.renderAttributePreview(entry)}
          </div>

          <aside class="grid gap-3 content-start">
            ${this.renderPhotoPreview(item)}
            ${this.renderLiveEnrichmentPanel(item)}
            <section class="studio-action-panel">
              <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Next Stage</div>
              <div class="grid gap-2">
                ${this.queueButton('Approve', 'approve', 'approved_committed', this.primaryReason(item), item, true)}
                ${this.queueButton('Request refinement', 'request_refinement', 'refinement_requested', this.primaryReason(item), item)}
                ${this.queueButton('Reject', 'reject', 'rejected', this.primaryReason(item), item)}
                ${this.queueButton('Flag photo issue', 'flag_photo_issue', 'needs_photo_review', 'photo_issue', item)}
                ${this.queueButton('Flag evidence issue', 'flag_evidence_issue', 'verification_queue', 'evidence_issue', item)}
              </div>
            </section>
          </aside>
        </div>
      </article>
    `
  }

  private queueButton(
    label: string,
    actionType: StudioReviewActionType,
    targetState: string,
    reason: string,
    item: ReviewItem,
    primary = false
  ) {
    return `
      <button type="button" class="${primary ? 'studio-action-primary' : 'studio-action-secondary'}"
        data-review-action="${this.escapeAttr(label)}"
        data-action-type="${this.escapeAttr(actionType)}"
        data-target-state="${this.escapeAttr(targetState)}"
        data-reason="${this.escapeAttr(reason)}"
        data-review-key="${this.escapeAttr(this.reviewKey(item))}"
        data-map-slug="${this.escapeAttr(item.mapSlug)}"
        data-batch-id="${this.escapeAttr(item.mapSlug)}"
        data-entry-id="${this.escapeAttr(item.entryId)}">
        ${this.escape(label)}
      </button>
    `
  }

  private renderLiveEnrichmentPanel(item: ReviewItem) {
    const needsPhoto = this.needsPhotoEnrichment(item)
    const key = this.reviewKey(item)

    return `
      <section class="studio-action-panel" data-enrichment-panel data-review-key="${this.escapeAttr(key)}">
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Live Enrichment</div>
        <div class="grid gap-2">
          ${needsPhoto ? this.enrichmentButton('Find real photos', 'enrich_photos', item, true) : ''}
          ${this.enrichmentButton('Enrich evidence', 'enrich_evidence', item)}
          ${this.enrichmentButton('Verify address', 'verify_location', item)}
          ${this.enrichmentButton('Refine profile', 'refine_profile', item)}
        </div>
        <div class="mt-3 text-xs leading-relaxed text-[#b8b2a8]" data-enrichment-status>
          Protected curator actions create provisional research jobs. Results must still be reviewed before promotion.
        </div>
      </section>
    `
  }

  private enrichmentButton(label: string, actionType: StudioEnrichmentJobKind, item: ReviewItem, primary = false) {
    return `
      <button type="button" class="${primary ? 'studio-action-primary' : 'studio-action-secondary'}"
        data-enrichment-action="${this.escapeAttr(actionType)}"
        data-review-key="${this.escapeAttr(this.reviewKey(item))}">
        ${this.escape(label)}
      </button>
    `
  }

  private renderEvidencePreview(entry: KnowledgeEntry | null) {
    const evidence = entry?.evidence || []
    const sources = entry?.sources || []

    return `
      <section>
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Evidence and Sources</div>
        ${evidence.length > 0 ? `
          <div class="grid gap-2">
            ${evidence.slice(0, 4).map(item => `
              <div class="studio-evidence-card">
                <div class="text-sm font-semibold text-[#e4e4e7]">${this.escape(item.source)}</div>
                <div class="text-xs text-[#a1a1aa]">${this.escape([item.type, item.date].filter(Boolean).join(' / '))}</div>
                ${item.detail ? `<div class="mt-1 text-xs text-[#e4e4e7]">${this.escape(item.detail)}</div>` : ''}
                ${item.url ? `<a class="mt-2 inline-block text-xs underline text-[#e4e4e7]" href="${this.escapeAttr(item.url)}" target="_blank" rel="noreferrer">Open source</a>` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="text-sm text-[#a1a1aa]">No structured evidence is loaded for this entry.</div>
        `}
        ${sources.length > 0 ? `
          <div class="mt-2 flex flex-wrap gap-1.5">
            ${sources.slice(0, 5).map(source => `<span class="studio-soft-tag">${this.escape(source)}</span>`).join('')}
          </div>
        ` : ''}
      </section>
    `
  }

  private renderPhotoPreview(item: ReviewItem) {
    const entry = item.entry
    const photos = entry?.photos?.length
      ? entry.photos
      : (entry?.photoEvidence || []).map(photo => ({
          url: photo.url,
          caption: photo.caption || 'Visual evidence',
          credit: photo.credit,
          type: photo.verified ? 'verified' : 'unverified',
        }))

    return `
      <section class="studio-action-panel">
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Photo / Visual Evidence</div>
        ${photos.length > 0 ? `
          <div class="grid gap-2">
            ${photos.slice(0, 3).map(photo => `
              <figure>
                <img class="studio-photo-thumb" src="${this.escapeAttr(photo.url)}" alt="" loading="lazy" onerror="this.hidden=true">
                <figcaption class="mt-1 text-[11px] leading-snug text-[#a1a1aa]">${this.escape(photo.caption)}</figcaption>
                ${photo.credit ? `<div class="text-[10px] text-[#a1a1aa]">${this.escape(photo.credit)}</div>` : ''}
              </figure>
            `).join('')}
          </div>
        ` : `
          <div class="text-sm text-[#a1a1aa]">${this.noPhotoCopy(item)}</div>
        `}
      </section>
    `
  }

  private renderAttributePreview(entry: KnowledgeEntry | null) {
    const attributes = entry?.attributes || {}
    const rows = Object.entries(attributes).slice(0, 6)

    if (rows.length === 0 && !entry?.notes && !entry?.historicalContext) return ''

    return `
      <section>
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Additional Context</div>
        <div class="grid gap-2 text-xs">
          ${rows.map(([key, value]) => this.previewFact(this.humanize(key), Array.isArray(value) ? value.join(', ') : String(value))).join('')}
          ${entry?.historicalContext ? this.previewFact('Historical Context', entry.historicalContext) : ''}
          ${entry?.notes ? this.previewFact('Notes', entry.notes) : ''}
        </div>
      </section>
    `
  }

  private renderApprovedSummary(approvedBatches: Array<{ summary: any; batch: ResearchBatch | null }>) {
    return `
      <section class="studio-approved-summary mt-4 border-t border-[#27272a] pt-3" data-queue-section="Approved / Committed">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h2 class="text-sm font-bold text-[#e4e4e7]">Approved / Committed</h2>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#17171a] text-[#a1a1aa]">${approvedBatches.length}</span>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          ${approvedBatches.length > 0 ? approvedBatches.map(({ summary, batch }) => `
            <article class="border border-[#27272a] p-3 bg-[#17171a]" data-batch-id="${this.escapeAttr(summary.id)}">
              <div class="font-semibold text-sm text-[#e4e4e7]">${this.escape(summary.name)}</div>
              <div class="text-xs text-[#a1a1aa]">${this.escape(summary.status)} / ${batch?.summary.totalProfiles ?? summary.totalProfiles} profiles</div>
            </article>
          `).join('') : `
            <div class="text-sm text-[#a1a1aa]">Committed research batches will appear here after approval.</div>
          `}
        </div>
      </section>
    `
  }

  private bindStudioActions(container: HTMLElement, items: ReviewItem[]) {
    const payload = container.querySelector('#studio-action-payload') as HTMLElement | null
    const status = container.querySelector('#studio-action-status') as HTMLElement | null
    const guidanceStatus = container.querySelector('#studio-guidance-status') as HTMLElement | null
    const noteField = container.querySelector('#studio-note') as HTMLTextAreaElement | null
    const modeInputs = Array.from(container.querySelectorAll('input[name="studio-action-mode"]')) as HTMLInputElement[]
    const submitButton = container.querySelector('[data-submit-payload]') as HTMLButtonElement | null
    const copyButton = container.querySelector('[data-copy-payload]') as HTMLButtonElement | null
    const clearButton = container.querySelector('[data-clear-payload]') as HTMLButtonElement | null
    const refineButton = container.querySelector('[data-refine-guidance]') as HTMLButtonElement | null
    const cards = Array.from(container.querySelectorAll('[data-review-card]')) as HTMLElement[]
    const previews = Array.from(container.querySelectorAll('[data-review-preview]')) as HTMLElement[]
    const filterButtons = Array.from(container.querySelectorAll('[data-map-filter]')) as HTMLElement[]
    const paneButtons = Array.from(container.querySelectorAll('[data-studio-pane-tab]')) as HTMLButtonElement[]
    const panes = Array.from(container.querySelectorAll('[data-studio-pane]')) as HTMLElement[]
    const desktopWorkflow = container.querySelector('[data-studio-workflow]') as HTMLElement | null
    const reviewItemByKey = new Map(items.map(item => [this.reviewKey(item), item]))
    let activeReviewKey = items[0] ? this.reviewKey(items[0]) : ''
    let activePane: 'review' | 'maps' | 'batches' = window.matchMedia('(max-width: 1023px)').matches ? 'review' : 'review'

    const getActionMode = () => {
      return (modeInputs.find(input => input.checked)?.value === 'batch' ? 'batch' : 'live') as StudioReviewActionPayload['actionMode']
    }

    const updatePayloadMode = () => {
      if (!payload || payload.dataset.empty === 'true') return
      try {
        const current = JSON.parse(payload.textContent || '{}')
        if (!current || typeof current !== 'object') return
        setPayload(JSON.stringify({
          ...current,
          actionMode: getActionMode(),
        }, null, 2))
      } catch {
        // Ignore non-JSON payload states.
      }
    }

    const setWorkflowStep = (step: string) => {
      container.querySelectorAll('[data-workflow-step]').forEach(node => {
        node.classList.toggle('is-active', (node as HTMLElement).dataset.workflowStep === step)
      })
    }

    const setPayload = (text: string, empty = false) => {
      if (payload) {
        payload.textContent = text
        payload.dataset.empty = empty ? 'true' : 'false'
      }
      if (submitButton) submitButton.disabled = empty
      if (copyButton) copyButton.disabled = empty
      if (clearButton) clearButton.disabled = empty
      if (refineButton) refineButton.disabled = empty || !noteField?.value.trim()
      if (status) {
        const mode = getActionMode()
        status.textContent = empty
          ? ''
          : mode === 'batch'
            ? 'Payload generated for a batch promotion/research pass; copy is available as fallback.'
            : 'Payload generated for live provisional Studio work; copy is available as fallback.'
      }
    }

    const selectReview = (key: string) => {
      activeReviewKey = key
      cards.forEach(card => card.setAttribute('aria-pressed', card.dataset.reviewKey === key ? 'true' : 'false'))
      previews.forEach(panel => {
        panel.hidden = panel.dataset.reviewKey !== key
      })
      setPayload('Choose a next-stage action from the selected preview.', true)
      setWorkflowStep('2')
      if (window.matchMedia('(max-width: 1023px)').matches) setPane('review')
    }

    const applyMapFilter = (slug: string) => {
      filterButtons.forEach(button => {
        button.setAttribute('aria-pressed', button.dataset.mapFilter === slug ? 'true' : 'false')
      })

      const visibleCards = cards.filter(card => {
        const visible = slug === 'all' || card.dataset.mapSlug === slug
        card.hidden = !visible
        return visible
      })
      previews.forEach(panel => {
        panel.hidden = true
      })

      if (visibleCards[0]?.dataset.reviewKey) {
        selectReview(visibleCards[0].dataset.reviewKey)
      } else {
        setPayload('No review items match this map filter.', true)
      }

      container.querySelector('[data-review-workspace]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    const setPane = (pane: 'review' | 'maps' | 'batches') => {
      activePane = pane
      paneButtons.forEach(button => {
        const active = button.dataset.studioPaneTab === pane
        button.classList.toggle('is-active', active)
        button.setAttribute('aria-pressed', active ? 'true' : 'false')
      })
      panes.forEach(section => {
        const sectionPane = section.dataset.studioPane
        section.hidden = window.matchMedia('(max-width: 1023px)').matches ? sectionPane !== pane : false
      })
      if (pane === 'review') {
        container.querySelector('[data-review-workspace]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else if (pane === 'maps') {
        container.querySelector('[data-studio-pane="maps"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      } else {
        container.querySelector('[data-studio-pane="batches"]')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }
    }

    const syncPaneVisibility = () => {
      const isMobile = window.matchMedia('(max-width: 1023px)').matches
      if (desktopWorkflow) desktopWorkflow.hidden = isMobile
      panes.forEach(section => {
        section.hidden = isMobile ? section.dataset.studioPane !== activePane : false
      })
      if (!isMobile) {
        paneButtons.forEach(button => {
          button.classList.remove('is-active')
          button.setAttribute('aria-pressed', 'false')
        })
      } else {
        paneButtons.forEach(button => {
          const active = button.dataset.studioPaneTab === activePane
          button.classList.toggle('is-active', active)
          button.setAttribute('aria-pressed', active ? 'true' : 'false')
        })
      }
    }

    cards.forEach(card => {
      card.addEventListener('click', () => {
        if (card.dataset.reviewKey) selectReview(card.dataset.reviewKey)
      })
    })

    filterButtons.forEach(button => {
      button.addEventListener('click', () => {
        applyMapFilter(button.dataset.mapFilter || 'all')
      })
    })

    paneButtons.forEach(button => {
      button.addEventListener('click', () => {
        const pane = button.dataset.studioPaneTab as 'review' | 'maps' | 'batches' | undefined
        if (pane) setPane(pane)
      })
    })

    container.querySelectorAll('[data-review-action]').forEach(button => {
      button.addEventListener('click', () => {
        const el = button as HTMLElement
        const selectedKey = el.dataset.reviewKey || activeReviewKey
        const note = noteField?.value.trim() || ''
        const reviewItem = reviewItemByKey.get(selectedKey || '')
        const reviewPayload = {
          mapSlug: el.dataset.mapSlug || reviewItem?.mapSlug || el.dataset.batchId,
          entryId: el.dataset.entryId || reviewItem?.entryId,
          actionType: el.dataset.actionType || this.actionTypeForLabel(el.dataset.reviewAction || ''),
          actionMode: getActionMode(),
          action: el.dataset.reviewAction,
          reason: el.dataset.reason,
          targetState: el.dataset.targetState,
          note,
          createdAt: new Date().toISOString(),
          source: 'mosaic-static-studio',
        }
        setPayload(JSON.stringify(reviewPayload, null, 2))
        setWorkflowStep('3')
      })
    })

    container.querySelectorAll('[data-enrichment-action]').forEach(button => {
      button.addEventListener('click', async () => {
        const el = button as HTMLButtonElement
        const key = el.dataset.reviewKey || ''
        const item = reviewItemByKey.get(key)
        const actionType = el.dataset.enrichmentAction as StudioEnrichmentJobKind
        const enrichmentPanel = Array.from(container.querySelectorAll('[data-enrichment-panel]') as NodeListOf<HTMLElement>)
          .find(node => node.dataset.reviewKey === key)
        const panel = enrichmentPanel?.querySelector('[data-enrichment-status]') as HTMLElement | null

        if (!item || !actionType) return

        el.disabled = true
        if (panel) panel.innerHTML = this.renderEnrichmentState('queued', 'Queueing protected enrichment job...')

        try {
          const result = await requestStudioEnrichment({
            actionType,
            mapSlug: item.mapSlug,
            mapTitle: item.mapTitle,
            entryId: item.entryId,
            entryName: item.entryName,
            entry: item.entry,
            issues: item.issues,
          })
          if (panel) panel.innerHTML = this.renderEnrichmentJob(result.job)
          setPayload(JSON.stringify({
            mapSlug: item.mapSlug,
            entryId: item.entryId,
            actionType,
            actionMode: 'live',
            action: this.labelForEnrichment(actionType),
            reason: actionType,
            targetState: actionType === 'enrich_photos' ? 'needs_photo_review' : 'verification_queue',
            jobId: result.job.jobId,
            createdAt: new Date().toISOString(),
            source: 'mosaic-static-studio',
          }, null, 2))
          setWorkflowStep('3')
          if (result.job.status === 'queued' || result.job.status === 'running') {
            await this.pollEnrichmentJob(result.job.jobId, panel)
          }
        } catch (err) {
          const message = err instanceof Error ? err.message : 'Enrichment request failed'
          if (panel) panel.innerHTML = this.renderEnrichmentState('failed', `${message}. Copy/paste fallback remains available.`)
        } finally {
          el.disabled = false
        }
      })
    })

    noteField?.addEventListener('input', () => {
      if (refineButton) refineButton.disabled = !noteField.value.trim() || payload?.dataset.empty === 'true'
    })

    modeInputs.forEach(input => {
      input.addEventListener('change', updatePayloadMode)
    })

    refineButton?.addEventListener('click', async () => {
      const note = noteField?.value.trim() || ''
      const selected = reviewItemByKey.get(activeReviewKey)
      if (!selected || !note) {
        if (guidanceStatus) guidanceStatus.textContent = 'Add a curator note first.'
        return
      }

      if (guidanceStatus) guidanceStatus.textContent = 'Refining guidance with Grok...'

      try {
        const result = await refineHunt({
          topic: selected.mapTitle,
          guidance: note,
        })
        const guidanceUpdate = [
          `Scope: ${result.spec.scope}`,
          `Must-haves: ${result.spec.mustHaveConstraints.join('; ')}`,
          `Exclusions: ${result.spec.exclusions.join('; ')}`,
          `Photo policy: ${result.spec.photoPolicy}`,
          `Quality targets: ${result.spec.qualityTargets.join('; ')}`,
        ].join('\n')

        const current = payload?.dataset.empty === 'true' ? {} : JSON.parse(payload?.textContent || '{}')
        const nextPayload = {
          ...(current && typeof current === 'object' ? current : {}),
          mapSlug: selected.mapSlug,
          entryId: selected.entryId,
          actionMode: getActionMode(),
          note,
          refinementMode: result.mode,
          guidanceUpdate,
        }
        setPayload(JSON.stringify(nextPayload, null, 2))
        if (guidanceStatus) guidanceStatus.textContent = `Grok refined the guidance for ${selected.mapTitle}.`
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Guidance refinement failed'
        if (guidanceStatus) guidanceStatus.textContent = message
      }
    })

    copyButton?.addEventListener('click', async () => {
      const text = payload?.textContent || ''
      if (!text || payload?.dataset.empty === 'true') return

      try {
        await navigator.clipboard.writeText(text)
        if (status) status.textContent = 'Payload copied.'
      } catch {
        if (status) status.textContent = 'Copy is unavailable in this browser context. Select the payload text manually.'
      }
    })

    submitButton?.addEventListener('click', async () => {
      const text = payload?.textContent || ''
      if (!text || payload?.dataset.empty === 'true') return

      try {
        const reviewPayload = JSON.parse(text) as StudioReviewActionPayload
        submitButton.disabled = true
        if (status) status.textContent = 'Submitting review action...'
        const result = await submitStudioReviewAction(reviewPayload)
        if (status) status.textContent = result.action.submittedBy === 'local-fallback'
          ? `Saved locally as ${result.actionId}. Netlify was unavailable, so copy remains available as fallback.`
          : result.action.actionMode === 'batch'
            ? `Queued for batch promotion/research as ${result.actionId}.`
            : `Submitted for live provisional Studio processing as ${result.actionId}.`
      } catch (err) {
        submitButton.disabled = false
        const message = err instanceof Error ? err.message : 'Submission failed'
        if (status) status.textContent = `Submit failed: ${message}. Copy remains available as fallback.`
      }
    })

    clearButton?.addEventListener('click', () => {
      setPayload('Choose a next-stage action from the selected preview.', true)
      setWorkflowStep('1')
      if (guidanceStatus) guidanceStatus.textContent = ''
    })

    container.querySelector('[data-clear-curator-key]')?.addEventListener('click', () => {
      clearStoredHuntKey()
      if (status) status.textContent = 'Curator key cleared. The next protected action will ask for the shared key.'
    })

    window.addEventListener('resize', syncPaneVisibility, { passive: true })
    syncPaneVisibility()
  }

  private classifyQueueState(flag: ReviewFlag): QueueState {
    if (flag.issues.some(issue => /photo|visual/i.test(issue))) return 'Needs Photo Review'
    if (flag.issues.some(issue => /coordinate|evidence|source/i.test(issue))) return 'Verification Queue'
    return 'Refinement Requested'
  }

  private needsPhotoEnrichment(item: ReviewItem) {
    return item.issues.some(issue => /photo|visual/i.test(issue))
  }

  private actionTypeForLabel(label: string): StudioReviewActionType {
    const normalized = label.toLowerCase().replace(/\s+/g, '_')
    if (normalized === 'approve') return 'approve'
    if (normalized === 'reject') return 'reject'
    if (normalized === 'request_refinement') return 'request_refinement'
    if (normalized === 'flag_photo_issue') return 'flag_photo_issue'
    if (normalized === 'flag_evidence_issue') return 'flag_evidence_issue'
    return 'request_refinement'
  }

  private labelForEnrichment(actionType: StudioEnrichmentJobKind) {
    if (actionType === 'enrich_photos') return 'Find real photos'
    if (actionType === 'enrich_evidence') return 'Enrich evidence'
    if (actionType === 'verify_location') return 'Verify address'
    return 'Refine profile'
  }

  private async pollEnrichmentJob(jobId: string, panel: HTMLElement | null) {
    for (let attempt = 0; attempt < 18; attempt += 1) {
      await new Promise(resolve => window.setTimeout(resolve, 1800))
      try {
        const result = await getStudioEnrichmentJob(jobId)
        if (panel) panel.innerHTML = this.renderEnrichmentJob(result.job)
        if (result.job.status === 'ready' || result.job.status === 'failed') return
      } catch (err) {
        if (panel) {
          const message = err instanceof Error ? err.message : 'Unable to poll enrichment status'
          panel.innerHTML = this.renderEnrichmentState('failed', message)
        }
        return
      }
    }
  }

  private renderEnrichmentJob(job: StudioEnrichmentJob) {
    if (job.status !== 'ready') {
      return this.renderEnrichmentState(job.status, job.lastError || `${this.humanize(job.kind)} job ${job.status}.`)
    }

    const result = job.result
    if (!result) return this.renderEnrichmentState('ready', 'Enrichment completed without candidate output.')

    return `
      <div class="studio-enrichment-result">
        <div class="flex items-center justify-between gap-2">
          <span class="studio-job-pill">${this.escape(result.mode)} result</span>
          <span class="text-[10px] text-[#a1a1aa]">${this.escape(new Date(result.generatedAt).toLocaleTimeString())}</span>
        </div>
        <p class="mt-2 text-xs leading-relaxed text-[#e4e4e7]">${this.escape(result.summary)}</p>
        ${result.candidates.length > 0 ? `
          <div class="mt-3 grid gap-2">
            ${result.candidates.slice(0, 4).map(candidate => `
              <article class="studio-candidate-card">
                ${candidate.url ? `<a class="text-xs font-bold underline text-[#e4e4e7]" href="${this.escapeAttr(candidate.url)}" target="_blank" rel="noreferrer">${this.escape(candidate.caption)}</a>` : `<div class="text-xs font-bold text-[#e4e4e7]">${this.escape(candidate.caption)}</div>`}
                <div class="mt-1 text-[11px] text-[#b8b2a8]">${this.escape(candidate.locationTie)}</div>
                ${candidate.sourceUrl ? `<a class="mt-1 inline-block text-[11px] underline text-[#c9a86c]" href="${this.escapeAttr(candidate.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>` : ''}
              </article>
            `).join('')}
          </div>
        ` : ''}
        ${result.evidenceNotes.length > 0 ? `
          <div class="mt-2 text-[11px] leading-relaxed text-[#b8b2a8]">
            ${result.evidenceNotes.slice(0, 3).map(note => `<div>${this.escape(note)}</div>`).join('')}
          </div>
        ` : ''}
      </div>
    `
  }

  private renderEnrichmentState(status: StudioEnrichmentJob['status'], message: string) {
    return `
      <div class="studio-enrichment-state" data-status="${this.escapeAttr(status)}">
        <span class="studio-job-pill">${this.escape(status)}</span>
        <span>${this.escape(message)}</span>
      </div>
    `
  }

  private assessmentChecklist(item: ReviewItem) {
    const checks = new Set<string>()

    for (const issue of item.issues) {
      if (/coordinate/i.test(issue)) checks.add('Verify the street address and coordinates against a current source before this appears on the map.')
      if (/source/i.test(issue)) checks.add('Find reachable source URLs for the profile claims and current operating status.')
      if (/evidence|thin/i.test(issue)) checks.add('Confirm the description is supported by specific evidence, not generic local reputation.')
      if (/photo/i.test(issue)) checks.add(`${this.visualNoun(item, true)} should be from the real place and visibly match the map intent.`)
      if (/unverified/i.test(issue)) checks.add('Confirm every visual source is tied to this exact entry, not a stock or generic example.')
    }

    if (checks.size === 0) checks.add('Review the profile, evidence, photos, and location before selecting the next stage.')
    return Array.from(checks)
  }

  private previewFact(label: string, value: string) {
    return `
      <div class="studio-fact">
        <div class="text-[10px] uppercase tracking-[1px] text-[#a1a1aa]">${this.escape(label)}</div>
        <div class="mt-0.5 text-[#e4e4e7] break-words">${this.escape(value)}</div>
      </div>
    `
  }

  private renderEmptyPreview() {
    return `
      <div class="p-4 text-sm text-[#a1a1aa]">
        No queued entry is selected.
      </div>
    `
  }

  private emptyCopyForState(state: QueueState) {
    if (state === 'Needs Photo Review') return 'No visual review items in this slice.'
    if (state === 'Refinement Requested') return 'No refinement items in this slice.'
    return 'No verification items in this slice.'
  }

  private primaryReason(item: ReviewItem) {
    return item.issues[0] || 'review_requested'
  }

  private reviewKey(flag: Pick<ReviewFlag, 'mapSlug' | 'entryId'>) {
    return `${flag.mapSlug}:${flag.entryId}`
  }

  private locationLine(entry: KnowledgeEntry | null, item: ReviewItem) {
    if (!entry) return `${item.city} / ${item.mapTitle}`
    return [entry.location.address, entry.location.city, entry.location.region, entry.location.country].filter(Boolean).join(', ')
  }

  private formatIssueLabel(flag: Pick<ReviewFlag, 'mapTitle'>, issue: string) {
    if (!/product_photos/i.test(issue)) return issue

    const mapTitle = `${flag.mapTitle || ''}`.toLowerCase()
    if (/architecture|building|modernist/.test(mapTitle)) return issue.replace(/product_photos/ig, 'visual_documentation')
    if (/folk|tradition|craft|heritage|music|dance|ritual/.test(mapTitle)) return issue.replace(/product_photos/ig, 'field_documentation')
    return issue
  }

  private noPhotoCopy(item: ReviewItem) {
    return `No ${this.visualNoun(item)} is loaded for this entry yet. Use photo review if the current sources do not prove the visual belongs to the real place.`
  }

  private visualNoun(item: ReviewItem, plural = false) {
    const mapTitle = item.mapTitle.toLowerCase()
    if (/architecture|building|modernist/.test(mapTitle)) return plural ? 'Visual documentation images' : 'visual documentation'
    if (/folk|tradition|craft|heritage|music|dance|ritual/.test(mapTitle)) return plural ? 'Field documentation images' : 'field documentation'
    return plural ? 'Product photos' : 'product photo evidence'
  }

  private humanize(key: string) {
    return key
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_-]+/g, ' ')
      .replace(/\b\w/g, letter => letter.toUpperCase())
  }

  private reviewCountsByMap(items: ReviewItem[]) {
    const counts = new Map<string, number>()
    for (const item of items) {
      counts.set(item.mapSlug, (counts.get(item.mapSlug) || 0) + 1)
    }
    return counts
  }

  private compactMapTitle(title: string) {
    return title
      .replace(/\s+in the\s+/i, ' - ')
      .replace(/\s+Capital District/i, ' Capital District')
      .replace(/\s+Verified Albany Radial Seed/i, '')
  }

  private appHref(path: string) {
    const base = import.meta.env.BASE_URL || '/'
    return `${base}${path.replace(/^\//, '')}`.replace(/\/+/g, '/')
  }

  private escape(value: unknown) {
    return `${value ?? ''}`
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  private escapeAttr(value: unknown) {
    return this.escape(value)
  }

  private renderBatch(summary: any, batch: ResearchBatch | null) {
    const profiles = batch?.summary.totalProfiles ?? summary.totalProfiles
    const photos = batch?.summary.profilesWithPhotos ?? summary.profilesWithPhotos
    const photoRate = profiles > 0 ? Math.round((photos / profiles) * 100) : 0
    const runs = batch?.runs || []
    const locations = batch?.summary.locationsCovered || []
    const reviewState = batch?.reviewState
    const workflowStates = batch?.workflowStates || []
    const artifacts = batch?.artifacts || []

    return `
      <section class="mosaic-card border border-[#27272a] p-4">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <h2 class="text-lg font-bold text-[#e4e4e7]">${this.escape(summary.name)}</h2>
              <span class="studio-status-badge">${this.escape(summary.status)}</span>
            </div>
            <div class="text-sm text-[#a1a1aa]">${this.escape(summary.topic)}</div>
            ${batch?.notes ? `<p class="mt-3 text-sm leading-relaxed text-[#e4e4e7]">${this.escape(batch.notes)}</p>` : ''}
          </div>

          <div class="grid grid-cols-3 gap-2 text-center min-w-[260px]">
            ${this.metric('Profiles', String(profiles))}
            ${this.metric('Photos', `${photoRate}%`)}
            ${this.metric('Runs', String(runs.length))}
          </div>
        </div>

        ${locations.length > 0 ? `
          <div class="mt-4 flex flex-wrap gap-1.5">
            ${locations.map(location => `
              <span class="text-xs px-2 py-1 rounded bg-[#1f1d1a] text-[#e4e4e7]">${this.escape(location)}</span>
            `).join('')}
          </div>
        ` : ''}

        ${reviewState || workflowStates.length > 0 ? `
          <div class="mt-4 border-t border-[#27272a] pt-3">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa]">Hunt Pipeline State</div>
                <div class="text-sm text-[#e4e4e7]">${this.escape(reviewState || summary.status)}</div>
              </div>
              ${batch?.promotion?.approvalRequired ? `
                <div class="text-xs px-2 py-1 rounded bg-[#1f1d1a] text-[#e4e4e7]">Promotion requires explicit approval</div>
              ` : ''}
            </div>
            ${workflowStates.length > 0 ? `
              <div class="mt-3 flex flex-wrap gap-1.5">
                ${workflowStates.map(state => `
                  <span class="text-[11px] px-2 py-1 rounded ${state.complete ? 'bg-[#c9a86c] text-[#0f0f11]' : 'bg-[#1f1d1a] text-[#e4e4e7]'}">${this.escape(state.state)}</span>
                `).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${artifacts.length > 0 ? `
          <div class="mt-4 border-t border-[#27272a] pt-3">
            <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Review Artifacts</div>
            <div class="flex flex-wrap gap-2">
              ${artifacts.map(artifact => `
                <a class="studio-action-secondary" href="${this.escapeAttr(this.artifactHref(artifact.path))}" target="_blank" rel="noreferrer">${this.escape(artifact.label)}</a>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${runs.length > 0 ? `
          <div class="mt-4 border-t border-[#27272a] pt-3">
            <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Run Summary</div>
            <div class="grid gap-2">
              ${runs.map(run => `
                <div class="text-sm grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <div>${run.summary.entriesProduced} entries</div>
                  <div>${run.summary.photosWithBriefs} photo briefs</div>
                  <div>${this.escape(run.summary.averageConfidence)} confidence</div>
                  <div>${run.modelConfig.locationTargets.map(location => this.escape(location)).join(', ')}</div>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </section>
    `
  }

  private metric(label: string, value: string) {
    return `
      <div class="studio-metric">
        <div class="text-lg font-bold text-[#e4e4e7]">${this.escape(value)}</div>
        <div class="text-[10px] uppercase tracking-[1px] text-[#a1a1aa]">${this.escape(label)}</div>
      </div>
    `
  }

  private artifactHref(path: string) {
    const cleaned = path.replace(/^public\//, '')
    const base = import.meta.env.BASE_URL || '/'
    return `${base}${cleaned}`.replace(/\/+/g, '/')
  }
}
