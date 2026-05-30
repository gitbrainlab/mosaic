import { loadEnrichmentBacklog, loadEntries, loadResearchBatch, loadResearchBatchIndex } from '../lib/data-loader'
import type { KnowledgeEntry, ResearchBatch } from '../types'

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

export default class StudioView {
  async mount(container: HTMLElement) {
    container.innerHTML = `
      <div class="p-5 max-w-6xl mx-auto">
        <div class="mb-5">
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">CURATION STUDIO</div>
          <h1 class="text-2xl font-semibold tracking-tight text-[#111] dark:text-white">Research Batches</h1>
        </div>
        <div class="animate-pulse text-sm text-[#6b6761]">Loading batches...</div>
      </div>
    `

    const indexResult = await loadResearchBatchIndex()

    if (!indexResult.data) {
      container.innerHTML = `
        <div class="p-5 max-w-6xl mx-auto">
          <div class="text-red-600">Failed to load research batches: ${this.escape(indexResult.error)}</div>
        </div>
      `
      return
    }

    const batches = await Promise.all(
      indexResult.data.batches.map(async summary => {
        const result = await loadResearchBatch(summary.file)
        return { summary, batch: result.data }
      })
    )

    const backlogResult = await loadEnrichmentBacklog()
    const backlog = backlogResult.data
    const topFlags = ((backlog?.backlog || []) as ReviewFlag[]).slice(0, 18)
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
      <div class="p-5 max-w-6xl mx-auto">
        <div class="mb-5">
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">CURATION STUDIO</div>
          <h1 class="text-2xl font-semibold tracking-tight text-[#111] dark:text-white">Research Batches</h1>
        </div>

        ${this.renderReviewWorkspace(reviewItems, approvedBatches, backlog)}

        <div class="grid gap-4">
          ${batches.map(({ summary, batch }) => this.renderBatch(summary, batch)).join('')}
        </div>
      </div>
    `

    this.bindStudioActions(container)
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

  private renderReviewWorkspace(
    items: ReviewItem[],
    approvedBatches: Array<{ summary: any; batch: ResearchBatch | null }>,
    backlog: { generatedAt: string; totalFlaggedEntries: number; totalMaps: number } | null
  ) {
    const firstKey = items[0] ? this.reviewKey(items[0]) : ''

    return `
      <section class="mb-5" data-review-workspace>
        <div class="border-2 border-[#3f3b33] dark:border-[#d4cebf] bg-white dark:bg-[#141310] p-4">
          <div class="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">Static Review Queue</div>
              <div class="text-sm text-[#2c2a27] dark:text-[#e8e4d9]">
                ${backlog ? `${backlog.totalFlaggedEntries} flagged entries across ${backlog.totalMaps} maps` : 'No backlog index loaded yet'}
              </div>
            </div>
            <div class="text-xs text-[#6b6761] dark:text-[#a39a8c]">
              ${backlog ? `Generated ${new Date(backlog.generatedAt).toLocaleString()}` : 'Artifact-only actions; no runtime backend'}
            </div>
          </div>

          <div class="mt-4 grid gap-3 md:grid-cols-3">
            ${this.workflowStep('1', 'Select a card', 'Pick the entry that needs verification, photo review, or refinement.')}
            ${this.workflowStep('2', 'Inspect the preview', 'Check the profile, evidence, sources, photos, and exact location before deciding.')}
            ${this.workflowStep('3', 'Choose next stage', 'Generate a static JSON action that can be copied into the GitHub-native curation flow.')}
          </div>

          <div class="mt-5 grid gap-4 lg:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.35fr)]">
            <div class="border border-[#d8d2c4] dark:border-[#3f3b33] bg-[#fbfaf7] dark:bg-[#181713]">
              <div class="p-3 border-b border-[#e5e2d9] dark:border-[#3f3b33]">
                <div class="text-sm font-bold text-[#111] dark:text-white">Review List</div>
                <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${items.length} queued items shown by priority</div>
              </div>
              <div class="max-h-[540px] overflow-y-auto">
                ${items.length > 0 ? QUEUE_STATES.map(state => this.renderQueueGroup(state, items, firstKey)).join('') : `
                  <div class="p-4 text-sm text-[#5f5a52] dark:text-[#d4cebf]">No review items are currently queued.</div>
                `}
              </div>
            </div>

            <div class="grid gap-3">
              <div class="border border-[#d8d2c4] dark:border-[#3f3b33] bg-white dark:bg-[#181713] min-h-[420px]">
                ${items.length > 0 ? items.map((item, index) => this.renderPreviewPanel(item, index === 0)).join('') : this.renderEmptyPreview()}
              </div>

              <div class="border border-[#d8d2c4] dark:border-[#3f3b33] bg-[#fbfaf7] dark:bg-[#181713] p-3">
                <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-2">
                  <div>
                    <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">Generated Review Action</div>
                    <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">Actions below the preview create a copyable payload. Nothing is submitted from the static site.</div>
                  </div>
                  <div class="flex gap-2">
                    <button type="button" class="min-h-11 px-3 rounded border border-[#a39a8c] text-xs font-semibold text-[#2c2a27] dark:text-[#f1efea] disabled:opacity-45" data-copy-payload disabled>Copy payload</button>
                    <button type="button" class="min-h-11 px-3 rounded border border-[#a39a8c] text-xs font-semibold text-[#2c2a27] dark:text-[#f1efea] disabled:opacity-45" data-clear-payload disabled>Clear</button>
                  </div>
                </div>
                <pre id="studio-action-payload" class="min-h-24 whitespace-pre-wrap rounded border border-[#d8d2c4] dark:border-[#3f3b33] bg-white dark:bg-[#11100e] text-[#2c2a27] dark:text-[#f4f1e9] text-xs p-3 overflow-auto" data-empty="true">Choose a next-stage action from the selected preview.</pre>
                <div id="studio-action-status" class="mt-2 text-xs text-[#5f5a52] dark:text-[#d4cebf]"></div>
              </div>
            </div>
          </div>

          ${this.renderApprovedSummary(approvedBatches)}
        </div>
      </section>
    `
  }

  private workflowStep(number: string, title: string, copy: string) {
    return `
      <div class="border border-[#e5e2d9] dark:border-[#3f3b33] p-3 bg-[#fbfaf7] dark:bg-[#181713]">
        <div class="flex items-center gap-2">
          <span class="grid place-items-center size-7 rounded-full bg-[#1f1d1a] text-white dark:bg-white dark:text-[#111] text-xs font-bold">${number}</span>
          <div class="text-sm font-bold text-[#111] dark:text-white">${title}</div>
        </div>
        <div class="mt-2 text-xs leading-relaxed text-[#5f5a52] dark:text-[#d4cebf]">${copy}</div>
      </div>
    `
  }

  private renderQueueGroup(state: QueueState, items: ReviewItem[], selectedKey: string) {
    const groupItems = items.filter(item => item.queueState === state)

    return `
      <section class="border-b border-[#e5e2d9] dark:border-[#3f3b33]" data-queue-section="${state}">
        <div class="sticky top-0 z-10 bg-[#f1efea] dark:bg-[#1f1d1a] px-3 py-2 flex items-center justify-between gap-2">
          <h2 class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">${state}</h2>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-white dark:bg-[#2a2924] text-[#3f3b33] dark:text-[#e8e4d9]">${groupItems.length}</span>
        </div>
        <div class="grid">
          ${groupItems.length > 0 ? groupItems.map(item => this.renderQueueItem(item, selectedKey)).join('') : `
            <div class="p-3 text-sm text-[#5f5a52] dark:text-[#d4cebf]">${this.emptyCopyForState(state)}</div>
          `}
        </div>
      </section>
    `
  }

  private renderQueueItem(item: ReviewItem, selectedKey: string) {
    const key = this.reviewKey(item)
    return `
      <button type="button" class="studio-review-card text-left p-3 border-l-4 border-b border-[#e5e2d9] dark:border-[#3f3b33] bg-white dark:bg-[#181713] hover:bg-[#f8f7f4] dark:hover:bg-[#1f1d1a]"
        data-review-card
        data-review-key="${this.escapeAttr(key)}"
        aria-pressed="${key === selectedKey ? 'true' : 'false'}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold text-sm text-[#111] dark:text-white">${this.escape(item.entryName)}</div>
            <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${this.escape(item.mapTitle)} / ${this.escape(item.city)}</div>
          </div>
          <div class="text-[11px] px-2 py-0.5 rounded bg-[#1f1d1a] text-white dark:bg-white dark:text-[#111]">${item.priorityScore}</div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          ${item.issues.slice(0, 3).map(issue => `<span class="text-[11px] px-2 py-0.5 rounded bg-[#f1efea] dark:bg-[#2a2924] text-[#2c2a27] dark:text-[#e8e4d9]">${this.escape(this.formatIssueLabel(item, issue))}</span>`).join('')}
        </div>
      </button>
    `
  }

  private renderPreviewPanel(item: ReviewItem, selected: boolean) {
    const key = this.reviewKey(item)
    const entry = item.entry
    const mapDetailHref = `?/map/${encodeURIComponent(item.mapSlug)}&entry=${encodeURIComponent(item.entryId)}`

    return `
      <article class="studio-review-preview p-4" data-review-preview data-review-key="${this.escapeAttr(key)}" ${selected ? '' : 'hidden'}>
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 border-b border-[#e5e2d9] dark:border-[#3f3b33] pb-3">
          <div>
            <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">${this.escape(item.queueState)}</div>
            <h2 class="text-xl font-bold text-[#111] dark:text-white">${this.escape(entry?.name || item.entryName)}</h2>
            <div class="text-sm text-[#5f5a52] dark:text-[#d4cebf]">${this.escape(this.locationLine(entry, item))}</div>
          </div>
          <a class="min-h-11 inline-flex items-center justify-center px-3 rounded border border-[#a39a8c] text-xs font-semibold text-[#2c2a27] dark:text-[#f1efea] hover:bg-[#f1efea] dark:hover:bg-[#2a2924]" href="${mapDetailHref}">Open map detail</a>
        </div>

        <div class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_280px]">
          <div class="grid gap-4">
            <section>
              <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">What to Assess</div>
              <ul class="grid gap-2 text-sm text-[#2c2a27] dark:text-[#e8e4d9]">
                ${this.assessmentChecklist(item).map(check => `<li class="border-l-2 border-[#a39a8c] pl-3">${this.escape(check)}</li>`).join('')}
              </ul>
            </section>

            <section>
              <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">Profile Preview</div>
              <p class="text-sm leading-relaxed text-[#2c2a27] dark:text-[#e8e4d9]">${this.escape(entry?.description || 'No entry profile was found for this queue item.')}</p>
              <div class="mt-3 grid gap-2 sm:grid-cols-2 text-xs">
                ${this.previewFact('Confidence', entry?.confidence || item.confidence)}
                ${this.previewFact('Address', entry?.location.address || 'Address review needed')}
                ${this.previewFact('Coordinates', entry ? `${entry.location.lat}, ${entry.location.lng}` : 'Coordinate review needed')}
                ${this.previewFact('Map', item.mapTitle)}
              </div>
              ${entry?.tags?.length ? `
                <div class="mt-3 flex flex-wrap gap-1.5">
                  ${entry.tags.map(tag => `<span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924] text-[#2c2a27] dark:text-[#e8e4d9]">${this.escape(tag)}</span>`).join('')}
                </div>
              ` : ''}
            </section>

            ${this.renderEvidencePreview(entry)}
            ${this.renderAttributePreview(entry)}
          </div>

          <aside class="grid gap-3 content-start">
            ${this.renderPhotoPreview(item)}
            <section class="border border-[#e5e2d9] dark:border-[#3f3b33] p-3 bg-[#fbfaf7] dark:bg-[#11100e]">
              <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">Next Stage</div>
              <div class="grid gap-2">
                ${this.queueButton('Approve', 'approved_committed', this.primaryReason(item), item)}
                ${this.queueButton('Request refinement', 'refinement_requested', this.primaryReason(item), item)}
                ${this.queueButton('Reject', 'rejected', this.primaryReason(item), item)}
                ${this.queueButton('Flag photo issue', 'needs_photo_review', 'photo_issue', item)}
                ${this.queueButton('Flag evidence issue', 'verification_queue', 'evidence_issue', item)}
              </div>
            </section>
          </aside>
        </div>
      </article>
    `
  }

  private queueButton(label: string, targetState: string, reason: string, item: ReviewItem) {
    return `
      <button type="button" class="min-h-11 px-3 rounded border border-[#a39a8c] text-xs font-semibold text-[#2c2a27] dark:text-[#f1efea] hover:bg-[#f1efea] dark:hover:bg-[#2a2924]"
        data-review-action="${this.escapeAttr(label)}"
        data-target-state="${this.escapeAttr(targetState)}"
        data-reason="${this.escapeAttr(reason)}"
        data-map-slug="${this.escapeAttr(item.mapSlug)}"
        data-batch-id="${this.escapeAttr(item.mapSlug)}"
        data-entry-id="${this.escapeAttr(item.entryId)}">
        ${this.escape(label)}
      </button>
    `
  }

  private renderEvidencePreview(entry: KnowledgeEntry | null) {
    const evidence = entry?.evidence || []
    const sources = entry?.sources || []

    return `
      <section>
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">Evidence and Sources</div>
        ${evidence.length > 0 ? `
          <div class="grid gap-2">
            ${evidence.slice(0, 4).map(item => `
              <div class="border border-[#e5e2d9] dark:border-[#3f3b33] p-3 bg-[#fbfaf7] dark:bg-[#11100e]">
                <div class="text-sm font-semibold text-[#111] dark:text-white">${this.escape(item.source)}</div>
                <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${this.escape([item.type, item.date].filter(Boolean).join(' / '))}</div>
                ${item.detail ? `<div class="mt-1 text-xs text-[#2c2a27] dark:text-[#e8e4d9]">${this.escape(item.detail)}</div>` : ''}
                ${item.url ? `<a class="mt-2 inline-block text-xs underline text-[#2c2a27] dark:text-[#f1efea]" href="${this.escapeAttr(item.url)}" target="_blank" rel="noreferrer">Open source</a>` : ''}
              </div>
            `).join('')}
          </div>
        ` : `
          <div class="text-sm text-[#5f5a52] dark:text-[#d4cebf]">No structured evidence is loaded for this entry.</div>
        `}
        ${sources.length > 0 ? `
          <div class="mt-2 flex flex-wrap gap-1.5">
            ${sources.slice(0, 5).map(source => `<span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924] text-[#2c2a27] dark:text-[#e8e4d9]">${this.escape(source)}</span>`).join('')}
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
      <section class="border border-[#e5e2d9] dark:border-[#3f3b33] p-3 bg-[#fbfaf7] dark:bg-[#11100e]">
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">Photo / Visual Evidence</div>
        ${photos.length > 0 ? `
          <div class="grid gap-2">
            ${photos.slice(0, 3).map(photo => `
              <figure>
                <img class="w-full aspect-[4/3] object-cover border border-[#d8d2c4] dark:border-[#3f3b33]" src="${this.escapeAttr(photo.url)}" alt="${this.escapeAttr(photo.caption)}" loading="lazy">
                <figcaption class="mt-1 text-[11px] leading-snug text-[#5f5a52] dark:text-[#d4cebf]">${this.escape(photo.caption)}</figcaption>
                ${photo.credit ? `<div class="text-[10px] text-[#6b6761] dark:text-[#a39a8c]">${this.escape(photo.credit)}</div>` : ''}
              </figure>
            `).join('')}
          </div>
        ` : `
          <div class="text-sm text-[#5f5a52] dark:text-[#d4cebf]">${this.noPhotoCopy(item)}</div>
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
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">Additional Context</div>
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
      <section class="mt-4 border-t border-[#e5e2d9] dark:border-[#3f3b33] pt-3" data-queue-section="Approved / Committed">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h2 class="text-sm font-bold text-[#111] dark:text-white">Approved / Committed</h2>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#f1efea] dark:bg-[#2a2924] text-[#3f3b33] dark:text-[#e8e4d9]">${approvedBatches.length}</span>
        </div>
        <div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          ${approvedBatches.length > 0 ? approvedBatches.map(({ summary, batch }) => `
            <article class="border border-[#e5e2d9] dark:border-[#3f3b33] p-3 bg-[#fbfaf7] dark:bg-[#181713]" data-batch-id="${this.escapeAttr(summary.id)}">
              <div class="font-semibold text-sm text-[#111] dark:text-white">${this.escape(summary.name)}</div>
              <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${this.escape(summary.status)} / ${batch?.summary.totalProfiles ?? summary.totalProfiles} profiles</div>
            </article>
          `).join('') : `
            <div class="text-sm text-[#5f5a52] dark:text-[#d4cebf]">Committed research batches will appear here after approval.</div>
          `}
        </div>
      </section>
    `
  }

  private bindStudioActions(container: HTMLElement) {
    const payload = container.querySelector('#studio-action-payload') as HTMLElement | null
    const status = container.querySelector('#studio-action-status') as HTMLElement | null
    const copyButton = container.querySelector('[data-copy-payload]') as HTMLButtonElement | null
    const clearButton = container.querySelector('[data-clear-payload]') as HTMLButtonElement | null
    const cards = Array.from(container.querySelectorAll('[data-review-card]')) as HTMLElement[]
    const previews = Array.from(container.querySelectorAll('[data-review-preview]')) as HTMLElement[]

    const setPayload = (text: string, empty = false) => {
      if (payload) {
        payload.textContent = text
        payload.dataset.empty = empty ? 'true' : 'false'
      }
      if (copyButton) copyButton.disabled = empty
      if (clearButton) clearButton.disabled = empty
      if (status) status.textContent = empty ? '' : 'Payload generated. Copy it into the GitHub issue, PR comment, or agent handoff.'
    }

    const selectReview = (key: string) => {
      cards.forEach(card => card.setAttribute('aria-pressed', card.dataset.reviewKey === key ? 'true' : 'false'))
      previews.forEach(panel => {
        panel.hidden = panel.dataset.reviewKey !== key
      })
      setPayload('Choose a next-stage action from the selected preview.', true)
    }

    cards.forEach(card => {
      card.addEventListener('click', () => {
        if (card.dataset.reviewKey) selectReview(card.dataset.reviewKey)
      })
    })

    container.querySelectorAll('[data-review-action]').forEach(button => {
      button.addEventListener('click', () => {
        const el = button as HTMLElement
        const reviewPayload = {
          mapSlug: el.dataset.mapSlug || el.dataset.batchId,
          entryId: el.dataset.entryId,
          action: el.dataset.reviewAction,
          reason: el.dataset.reason,
          targetState: el.dataset.targetState,
          createdAt: new Date().toISOString(),
          source: 'mosaic-static-studio',
        }
        setPayload(JSON.stringify(reviewPayload, null, 2))
      })
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

    clearButton?.addEventListener('click', () => {
      setPayload('Choose a next-stage action from the selected preview.', true)
    })
  }

  private classifyQueueState(flag: ReviewFlag): QueueState {
    if (flag.issues.some(issue => /photo|visual/i.test(issue))) return 'Needs Photo Review'
    if (flag.issues.some(issue => /coordinate|evidence|source/i.test(issue))) return 'Verification Queue'
    return 'Refinement Requested'
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
      <div class="border border-[#e5e2d9] dark:border-[#3f3b33] p-2 bg-[#fbfaf7] dark:bg-[#11100e]">
        <div class="text-[10px] uppercase tracking-[1px] text-[#6b6761] dark:text-[#a39a8c]">${this.escape(label)}</div>
        <div class="mt-0.5 text-[#111] dark:text-white break-words">${this.escape(value)}</div>
      </div>
    `
  }

  private renderEmptyPreview() {
    return `
      <div class="p-4 text-sm text-[#5f5a52] dark:text-[#d4cebf]">
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
      <section class="mosaic-card border-2 border-[#3f3b33] dark:border-[#d4cebf] p-4">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <h2 class="text-lg font-bold text-[#111] dark:text-white">${this.escape(summary.name)}</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#1f1d1a] text-white dark:bg-white dark:text-[#111]">${this.escape(summary.status)}</span>
            </div>
            <div class="text-sm text-[#3f3b33] dark:text-[#d4cebf]">${this.escape(summary.topic)}</div>
            ${batch?.notes ? `<p class="mt-3 text-sm leading-relaxed text-[#2c2a27] dark:text-[#e8e4d9]">${this.escape(batch.notes)}</p>` : ''}
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
              <span class="text-xs px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924] text-[#2c2a27] dark:text-[#e8e4d9]">${this.escape(location)}</span>
            `).join('')}
          </div>
        ` : ''}

        ${reviewState || workflowStates.length > 0 ? `
          <div class="mt-4 border-t border-[#e5e2d9] dark:border-[#3f3b33] pt-3">
            <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">Hunt Pipeline State</div>
                <div class="text-sm text-[#111] dark:text-white">${this.escape(reviewState || summary.status)}</div>
              </div>
              ${batch?.promotion?.approvalRequired ? `
                <div class="text-xs px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924] text-[#2c2a27] dark:text-[#e8e4d9]">Promotion requires explicit approval</div>
              ` : ''}
            </div>
            ${workflowStates.length > 0 ? `
              <div class="mt-3 flex flex-wrap gap-1.5">
                ${workflowStates.map(state => `
                  <span class="text-[11px] px-2 py-1 rounded ${state.complete ? 'bg-[#1f1d1a] text-white dark:bg-white dark:text-[#111]' : 'bg-[#f1efea] dark:bg-[#2a2924] text-[#2c2a27] dark:text-[#e8e4d9]'}">${this.escape(state.state)}</span>
                `).join('')}
              </div>
            ` : ''}
          </div>
        ` : ''}

        ${artifacts.length > 0 ? `
          <div class="mt-4 border-t border-[#e5e2d9] dark:border-[#3f3b33] pt-3">
            <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">Review Artifacts</div>
            <div class="flex flex-wrap gap-2">
              ${artifacts.map(artifact => `
                <a class="min-h-11 inline-flex items-center px-3 rounded border border-[#a39a8c] text-xs font-semibold text-[#2c2a27] dark:text-[#f1efea] hover:bg-[#f1efea] dark:hover:bg-[#2a2924]" href="${this.escapeAttr(this.artifactHref(artifact.path))}" target="_blank" rel="noreferrer">${this.escape(artifact.label)}</a>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${runs.length > 0 ? `
          <div class="mt-4 border-t border-[#e5e2d9] dark:border-[#3f3b33] pt-3">
            <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">Run Summary</div>
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
      <div class="border border-[#e5e2d9] dark:border-[#3f3b33] rounded p-2">
        <div class="text-lg font-bold text-[#111] dark:text-white">${this.escape(value)}</div>
        <div class="text-[10px] uppercase tracking-[1px] text-[#6b6761] dark:text-[#a39a8c]">${this.escape(label)}</div>
      </div>
    `
  }

  private artifactHref(path: string) {
    const cleaned = path.replace(/^public\//, '')
    const base = import.meta.env.BASE_URL || '/'
    return `${base}${cleaned}`.replace(/\/+/g, '/')
  }
}
