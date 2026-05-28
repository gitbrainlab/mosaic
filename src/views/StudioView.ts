import { loadResearchBatch, loadResearchBatchIndex } from '../lib/data-loader'
import type { ResearchBatch } from '../types'

export default class StudioView {
  async mount(container: HTMLElement) {
    container.innerHTML = `
      <div class="p-5 max-w-5xl mx-auto">
        <div class="mb-5">
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">CURATION STUDIO</div>
          <h1 class="text-2xl font-semibold tracking-tight text-[#111] dark:text-white">Research Batches</h1>
        </div>
        <div class="animate-pulse text-sm text-[#6b6761]">Loading research batches...</div>
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

    container.innerHTML = `
      <div class="p-5 max-w-5xl mx-auto">
        <div class="mb-5">
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">CURATION STUDIO</div>
          <h1 class="text-2xl font-semibold tracking-tight text-[#111] dark:text-white">Research Batches</h1>
        </div>

        <div class="grid gap-4">
          ${batches.map(({ summary, batch }) => this.renderBatch(summary, batch)).join('')}
        </div>
      </div>
    `
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
