import { loadEnrichmentBacklog, loadResearchBatch, loadResearchBatchIndex } from '../lib/data-loader'
import type { ResearchBatch } from '../types'

export default class StudioView {
  async mount(container: HTMLElement) {
    container.innerHTML = `
      <div class="p-5 max-w-5xl mx-auto">
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
        <div class="p-5 max-w-5xl mx-auto">
          <div class="text-red-600">Failed to load research batches: ${indexResult.error}</div>
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
    const topFlags = backlog?.backlog.slice(0, 12) || []
    const photoFlags = topFlags.filter(flag => flag.issues.some(issue => /photo/i.test(issue))).slice(0, 6)
    const refinementFlags = topFlags.filter(flag => !photoFlags.includes(flag)).slice(0, 6)
    const approvedBatches = batches
      .filter(({ summary }) => /complete|committed|approved|published/i.test(summary.status))
      .slice(0, 4)

    container.innerHTML = `
      <div class="p-5 max-w-5xl mx-auto">
        <div class="mb-5">
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">CURATION STUDIO</div>
          <h1 class="text-2xl font-semibold tracking-tight text-[#111] dark:text-white">Research Batches</h1>
        </div>

        <section class="mosaic-card border-2 border-[#3f3b33] dark:border-[#d4cebf] p-4 mb-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
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

          <div class="mt-4 grid gap-3 lg:grid-cols-2">
            ${this.renderQueueSection('Verification Queue', topFlags.slice(0, 6), 'Needs evidence, coordinate, or profile verification before promotion.')}
            ${this.renderQueueSection('Needs Photo Review', photoFlags, 'Photo evidence needs real-location/source review.')}
            ${this.renderQueueSection('Refinement Requested', refinementFlags, 'Profiles need additional agent research or human curation notes.')}
            ${this.renderApprovedSection(approvedBatches)}
          </div>

          <div class="mt-4 border-t border-[#e5e2d9] dark:border-[#3f3b33] pt-3">
            <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf] mb-2">Action Payload Preview</div>
            <textarea id="studio-action-payload" readonly class="w-full min-h-28 rounded border border-[#a39a8c] bg-[#f8f7f4] dark:bg-[#141310] text-[#111] dark:text-[#f4f1e9] text-xs p-3 font-mono">Select a queue action to serialize a GitHub-native review payload.</textarea>
          </div>
        </section>

        <div class="grid gap-4">
          ${batches.map(({ summary, batch }) => this.renderBatch(summary, batch)).join('')}
        </div>
      </div>
    `

    this.bindStudioActions(container)
  }

  private renderQueueSection(title: string, flags: any[], emptyCopy: string) {
    return `
      <section class="border border-[#e5e2d9] dark:border-[#3f3b33] rounded-lg p-3" data-queue-section="${title}">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h2 class="text-sm font-bold text-[#111] dark:text-white">${title}</h2>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#f1efea] dark:bg-[#2a2924] text-[#3f3b33] dark:text-[#e8e4d9]">${flags.length}</span>
        </div>
        <div class="grid gap-2">
          ${flags.length > 0 ? flags.map(flag => this.renderQueueItem(flag)).join('') : `
            <div class="text-sm text-[#5f5a52] dark:text-[#d4cebf]">${emptyCopy}</div>
          `}
        </div>
      </section>
    `
  }

  private renderQueueItem(flag: any) {
    const firstIssue = flag.issues[0] || 'review_requested'
    return `
      <article class="border border-[#e5e2d9] dark:border-[#3f3b33] rounded p-3 bg-white dark:bg-[#1a1916]" data-map-slug="${flag.mapSlug}" data-entry-id="${flag.entryId}">
        <div class="flex items-start justify-between gap-2">
          <div>
            <div class="font-semibold text-sm text-[#111] dark:text-white">${flag.entryName}</div>
            <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${flag.mapTitle} • ${flag.city}</div>
          </div>
          <div class="text-[11px] px-2 py-0.5 rounded bg-[#1f1d1a] text-white dark:bg-white dark:text-[#111]">${flag.priorityScore}</div>
        </div>
        <div class="mt-2 flex flex-wrap gap-1">
          ${flag.issues.map((issue: string) => `<span class="text-[11px] px-2 py-0.5 rounded bg-[#f1efea] dark:bg-[#2a2924] text-[#2c2a27] dark:text-[#e8e4d9]">${this.formatIssueLabel(flag, issue)}</span>`).join('')}
        </div>
        <div class="mt-3 flex flex-wrap gap-2">
          ${this.queueButton('Approve', 'approved_committed', firstIssue, flag)}
          ${this.queueButton('Request refinement', 'refinement_requested', firstIssue, flag)}
          ${this.queueButton('Reject', 'rejected', firstIssue, flag)}
          ${this.queueButton('Flag photo issue', 'needs_photo_review', 'photo_issue', flag)}
          ${this.queueButton('Flag evidence issue', 'verification_queue', 'evidence_issue', flag)}
        </div>
      </article>
    `
  }

  private queueButton(label: string, targetState: string, reason: string, flag: any) {
    return `
      <button class="min-h-10 px-2.5 rounded border border-[#a39a8c] text-xs font-semibold text-[#2c2a27] dark:text-[#f1efea] hover:bg-[#f1efea] dark:hover:bg-[#2a2924]"
        data-review-action="${label}"
        data-target-state="${targetState}"
        data-reason="${reason}"
        data-batch-id="${flag.mapSlug}"
        data-entry-id="${flag.entryId}">
        ${label}
      </button>
    `
  }

  private formatIssueLabel(flag: any, issue: string) {
    if (!/product_photos/i.test(issue)) return issue

    const mapTitle = `${flag.mapTitle || ''}`.toLowerCase()
    if (/architecture|building|modernist/.test(mapTitle)) return issue.replace(/product_photos/ig, 'visual_documentation')
    if (/folk|tradition|craft|heritage|music|dance|ritual/.test(mapTitle)) return issue.replace(/product_photos/ig, 'field_documentation')
    return issue
  }

  private renderApprovedSection(approvedBatches: Array<{ summary: any; batch: ResearchBatch | null }>) {
    return `
      <section class="border border-[#e5e2d9] dark:border-[#3f3b33] rounded-lg p-3" data-queue-section="Approved / Committed">
        <div class="flex items-center justify-between gap-2 mb-2">
          <h2 class="text-sm font-bold text-[#111] dark:text-white">Approved / Committed</h2>
          <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#f1efea] dark:bg-[#2a2924] text-[#3f3b33] dark:text-[#e8e4d9]">${approvedBatches.length}</span>
        </div>
        <div class="grid gap-2">
          ${approvedBatches.length > 0 ? approvedBatches.map(({ summary, batch }) => `
            <article class="border border-[#e5e2d9] dark:border-[#3f3b33] rounded p-3 bg-white dark:bg-[#1a1916]" data-batch-id="${summary.id}">
              <div class="font-semibold text-sm text-[#111] dark:text-white">${summary.name}</div>
              <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${summary.status} • ${batch?.summary.totalProfiles ?? summary.totalProfiles} profiles</div>
              <button class="mt-3 min-h-10 px-2.5 rounded border border-[#a39a8c] text-xs font-semibold text-[#2c2a27] dark:text-[#f1efea] hover:bg-[#f1efea] dark:hover:bg-[#2a2924]"
                data-review-action="Approve"
                data-target-state="approved_committed"
                data-reason="batch_review"
                data-batch-id="${summary.id}"
                data-entry-id="batch">
                Approve
              </button>
            </article>
          `).join('') : `
            <div class="text-sm text-[#5f5a52] dark:text-[#d4cebf]">Committed research batches will appear here after approval.</div>
          `}
        </div>
      </section>
    `
  }

  private bindStudioActions(container: HTMLElement) {
    const payload = container.querySelector('#studio-action-payload') as HTMLTextAreaElement | null
    container.querySelectorAll('[data-review-action]').forEach(button => {
      button.addEventListener('click', () => {
        const el = button as HTMLElement
        const reviewPayload = {
          batchId: el.dataset.batchId,
          entryId: el.dataset.entryId,
          action: el.dataset.reviewAction,
          reason: el.dataset.reason,
          targetState: el.dataset.targetState,
          createdAt: new Date().toISOString(),
          source: 'mosaic-static-studio',
        }
        if (payload) payload.value = JSON.stringify(reviewPayload, null, 2)
      })
    })
  }

  private renderBatch(summary: any, batch: ResearchBatch | null) {
    const profiles = batch?.summary.totalProfiles ?? summary.totalProfiles
    const photos = batch?.summary.profilesWithPhotos ?? summary.profilesWithPhotos
    const photoRate = profiles > 0 ? Math.round((photos / profiles) * 100) : 0
    const runs = batch?.runs || []
    const locations = batch?.summary.locationsCovered || []

    return `
      <section class="mosaic-card border-2 border-[#3f3b33] dark:border-[#d4cebf] p-4">
        <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <div class="flex flex-wrap items-center gap-2 mb-1">
              <h2 class="text-lg font-bold text-[#111] dark:text-white">${summary.name}</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-[#1f1d1a] text-white dark:bg-white dark:text-[#111]">${summary.status}</span>
            </div>
            <div class="text-sm text-[#3f3b33] dark:text-[#d4cebf]">${summary.topic}</div>
            ${batch?.notes ? `<p class="mt-3 text-sm leading-relaxed text-[#2c2a27] dark:text-[#e8e4d9]">${batch.notes}</p>` : ''}
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
              <span class="text-xs px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924] text-[#2c2a27] dark:text-[#e8e4d9]">${location}</span>
            `).join('')}
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
                  <div>${run.summary.averageConfidence} confidence</div>
                  <div>${run.modelConfig.locationTargets.join(', ')}</div>
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
        <div class="text-lg font-bold text-[#111] dark:text-white">${value}</div>
        <div class="text-[10px] uppercase tracking-[1px] text-[#6b6761] dark:text-[#a39a8c]">${label}</div>
      </div>
    `
  }
}
