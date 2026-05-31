import maplibregl from 'maplibre-gl/dist/maplibre-gl.js'
import { goToGallery } from '../lib/router'
import { iterateHunt, promoteHunt } from '../lib/assistant'
import { loadHunt } from '../lib/data-loader'
import type { DraftHuntEntry, HuntState } from '../types/hunt'

export default class HuntView {
  private map: maplibregl.Map | null = null
  private state: HuntState | null = null
  private huntId = ''
  private disposed = false
  private pollTimer: number | null = null
  private actionError = ''

  mount(container: HTMLElement, params: { id: string }) {
    this.disposed = false
    this.huntId = params.id
    container.innerHTML = `
      <div class="p-5 max-w-6xl mx-auto">
        <div class="animate-pulse text-sm text-[#6b6761]">Loading draft Hunt...</div>
      </div>
    `
    void this.load(container)
  }

  unmount() {
    this.disposed = true
    if (this.pollTimer) window.clearTimeout(this.pollTimer)
    this.pollTimer = null
    this.map?.remove()
    this.map = null
  }

  private async load(container: HTMLElement) {
    try {
      const result = await loadHunt(this.huntId)
      if (!result.data) throw new Error(result.error || 'Hunt not found')
      this.state = result.data
      if (!this.disposed) {
        this.render(container)
        this.schedulePoll(container)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load Hunt'
      container.innerHTML = `
        <div class="p-5 max-w-3xl mx-auto">
          <button id="back-btn" class="min-h-11 px-3 rounded border border-[#a39a8c] text-sm">Maps</button>
          <div class="mt-5 text-red-600">${message}</div>
        </div>
      `
      container.querySelector('#back-btn')?.addEventListener('click', goToGallery)
    }
  }

  private render(container: HTMLElement) {
    if (!this.state) return
    const { profile, draftMap, events } = this.state
    const isBusy = profile.status === 'queued' || profile.status === 'running' || profile.status === 'iterating' || profile.status === 'promotion_queued'
    const canIterate = Boolean(draftMap) && !isBusy && profile.iterationCount < profile.maxIterations
    const canPromote = Boolean(draftMap) && !isBusy
    const promotionUrl = profile.promotion?.workflowRunUrl || profile.promotion?.workflowUrl || profile.promotion?.githubPrUrl || profile.promotion?.githubIssueUrl
    const title = draftMap?.title || profile.spec.title
    const noDraftFailed = !draftMap && profile.status === 'failed'
    const noDraftKicker = noDraftFailed ? 'Quality Gate' : 'Queued Hunt'
    const noDraftTitle = noDraftFailed ? 'Draft rejected before display.' : 'Draft generation is running.'
    const noDraftBody = noDraftFailed
      ? 'The live model did not return enough source-backed, topic-specific, currently operating places. This is intentional: weak candidates should not be shown as draft results.'
      : 'This page will refresh automatically when Netlify finishes the job.'

    container.innerHTML = `
      <div class="flex flex-col h-[calc(100dvh-4.25rem)] lg:h-[calc(100dvh-4.5rem)] min-h-0">
        <div class="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#e5e2d9] dark:border-[#3f3b33] bg-[#f8f7f4] dark:bg-[#141310]">
          <button id="back-btn" class="min-h-11 px-3 text-sm rounded-md border border-[#a39a8c] text-[#2c2a27] dark:text-[#f1efea]">Maps</button>
          <div class="min-w-0 text-center">
            <div class="text-[10px] uppercase tracking-[1.4px] font-bold text-[#5f5a52] dark:text-[#d4cebf]">Public Draft Hunt</div>
            <div class="font-semibold truncate text-[#111] dark:text-white">${title}</div>
          </div>
          <div class="text-[11px] px-2 py-1 rounded bg-[#1f1d1a] text-white dark:bg-white dark:text-[#111]">${profile.status}</div>
        </div>

        <div class="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_380px]">
          <div id="hunt-map" class="min-h-[42dvh] lg:min-h-0 ${draftMap ? '' : 'grid place-items-center bg-[#ebe8df] dark:bg-[#141310]'}">
            ${draftMap ? '' : `
              <div class="p-5 text-center max-w-sm">
                <div class="text-xs uppercase tracking-[1.4px] font-bold text-[#5f5a52] dark:text-[#d4cebf]">${noDraftKicker}</div>
                <div class="mt-2 text-lg font-semibold text-[#111] dark:text-white">${noDraftTitle}</div>
                <p class="mt-2 text-sm text-[#5f5a52] dark:text-[#d4cebf]">${noDraftBody}</p>
              </div>
            `}
          </div>

          <aside class="overflow-auto bg-white dark:bg-[#1a1916] border-t lg:border-t-0 lg:border-l border-[#e5e2d9] dark:border-[#3f3b33]">
            <div class="p-4 border-b border-[#e5e2d9] dark:border-[#3f3b33]">
              <p class="text-sm leading-relaxed text-[#2c2a27] dark:text-[#e8e4d9]">${draftMap?.narrative || profile.spec.intent}</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">Iteration ${profile.iterationCount}/${profile.maxIterations}</span>
                <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">${draftMap?.entries.length || 0} provisional entries</span>
                <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">${profile.spec.geography.label}</span>
              </div>
              ${this.actionError ? `<div class="mt-3 text-sm text-red-700 dark:text-red-300">${this.actionError}</div>` : ''}
            </div>

            <div class="p-4 border-b border-[#e5e2d9] dark:border-[#3f3b33]">
              <div class="text-xs uppercase tracking-[1px] font-bold mb-2 text-[#3f3b33] dark:text-[#d4cebf]">Draft Controls</div>
              <textarea id="iteration-instruction" ${canIterate ? '' : 'disabled'} rows="3" class="w-full rounded border border-[#a39a8c] bg-[#f8f7f4] dark:bg-[#141310] text-[#111] dark:text-[#f4f1e9] p-2 text-sm" placeholder="${draftMap ? 'Quality pass: exclude current entries, suppress closed/stale places, require current operating evidence.' : 'Draft controls unlock when the first job finishes.'}"></textarea>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <button id="iterate-btn" ${canIterate ? '' : 'disabled'} class="min-h-11 rounded bg-[#111] text-white dark:bg-white dark:text-[#111] text-sm font-semibold disabled:opacity-40">Deepen Draft</button>
                <button id="promote-btn" ${canPromote ? '' : 'disabled'} class="min-h-11 rounded border border-[#1f1d1a] dark:border-[#f4f1e9] text-sm font-semibold text-[#1f1d1a] dark:text-[#f4f1e9] disabled:opacity-40">Request Promotion</button>
              </div>
              ${promotionUrl ? `<a class="block mt-2 text-xs underline text-[#2c2a27] dark:text-[#e8e4d9]" href="${promotionUrl}" target="_blank" rel="noreferrer">Open GitHub Actions promotion</a>` : ''}
              ${this.renderControlNote(Boolean(draftMap), profile.status, isBusy, canIterate)}
            </div>

            ${draftMap ? `
              <div class="divide-y divide-[#e5e2d9] dark:divide-[#3f3b33]">
                ${draftMap.entries.map(entry => this.renderEntry(entry)).join('')}
              </div>
            ` : ''}

            ${draftMap?.suppressedCandidates.length ? `
              <div class="p-4 border-t border-[#e5e2d9] dark:border-[#3f3b33]">
                <div class="text-xs uppercase tracking-[1px] font-bold mb-2 text-[#3f3b33] dark:text-[#d4cebf]">Suppressed</div>
                <div class="grid gap-2">
                  ${draftMap.suppressedCandidates.map(item => `
                    <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]"><strong>${item.name}</strong>: ${item.reason}</div>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <div class="p-4 border-t border-[#e5e2d9] dark:border-[#3f3b33]">
              <div class="text-xs uppercase tracking-[1px] font-bold mb-2 text-[#3f3b33] dark:text-[#d4cebf]">Events</div>
              <div class="grid gap-2">
                ${events.slice(-6).reverse().map(event => `
                  <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${new Date(event.createdAt).toLocaleTimeString()} - ${event.message}</div>
                `).join('')}
              </div>
            </div>

            ${(this.state.jobs || []).length ? `
              <div class="p-4 border-t border-[#e5e2d9] dark:border-[#3f3b33]">
                <div class="text-xs uppercase tracking-[1px] font-bold mb-2 text-[#3f3b33] dark:text-[#d4cebf]">Jobs</div>
                <div class="grid gap-2">
                  ${(this.state.jobs || []).slice(-6).reverse().map(job => `
                    <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${job.kind}: ${job.status}${job.lastError ? ` - ${job.lastError}` : ''}</div>
                  `).join('')}
                </div>
              </div>
            ` : ''}
          </aside>
        </div>
      </div>
    `

    container.querySelector('#back-btn')?.addEventListener('click', goToGallery)
    container.querySelector('#iterate-btn')?.addEventListener('click', () => void this.handleIterate(container))
    container.querySelector('#promote-btn')?.addEventListener('click', () => void this.handlePromote(container))
    this.bindEntryDetails(container)
    if (draftMap) this.renderMap()
  }

  private renderEntry(entry: DraftHuntEntry) {
    const entryName = this.escape(entry.name)
    const detailId = `hunt-entry-detail-${this.escapeAttr(entry.id)}`
    return `
      <article class="p-4" data-entry-id="${this.escapeAttr(entry.id)}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="font-semibold text-[#111] dark:text-white">${entryName}</h2>
            <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${this.escape(entry.location.city)}${entry.location.region ? `, ${this.escape(entry.location.region)}` : ''}</div>
          </div>
          <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">${this.escape(entry.confidence)}</span>
        </div>
        <p class="mt-2 text-sm leading-relaxed text-[#2c2a27] dark:text-[#e8e4d9]">${this.escape(entry.summary)}</p>
        <div class="mt-2 flex flex-wrap gap-1">
          <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">photo: ${this.escape(entry.photoStatus)}</span>
          ${entry.tags.slice(0, 4).map(tag => `<span class="text-[11px] px-2 py-1 rounded bg-[#f8f7f4] dark:bg-[#141310]">${this.escape(tag)}</span>`).join('')}
        </div>
        <button
          type="button"
          class="mt-3 min-h-10 w-full rounded border border-[#a39a8c] px-3 text-left text-sm font-semibold text-[#1f1d1a] dark:text-[#f4f1e9]"
          data-hunt-entry-toggle="${this.escapeAttr(entry.id)}"
          aria-expanded="false"
          aria-controls="${detailId}"
        >
          Details
        </button>
        <div id="${detailId}" class="mt-3 hidden rounded border border-[#e5e2d9] bg-[#f8f7f4] p-3 text-xs text-[#2c2a27] dark:border-[#3f3b33] dark:bg-[#141310] dark:text-[#e8e4d9]" data-hunt-entry-detail="${this.escapeAttr(entry.id)}">
          <dl class="grid gap-2">
            <div>
              <dt class="font-bold uppercase tracking-[1px] text-[#5f5a52] dark:text-[#d4cebf]">Exact address</dt>
              <dd class="mt-0.5">${this.escape(this.formatAddress(entry))}</dd>
            </div>
            <div>
              <dt class="font-bold uppercase tracking-[1px] text-[#5f5a52] dark:text-[#d4cebf]">Coordinates</dt>
              <dd class="mt-0.5">${entry.location.lat.toFixed(5)}, ${entry.location.lng.toFixed(5)}</dd>
            </div>
            <div>
              <dt class="font-bold uppercase tracking-[1px] text-[#5f5a52] dark:text-[#d4cebf]">Evidence leads</dt>
              <dd class="mt-1 grid gap-1">
                ${entry.evidenceHints.length > 0 ? entry.evidenceHints.map(hint => `<span>${this.escape(hint)}</span>`).join('') : '<span>No evidence leads returned yet.</span>'}
              </dd>
            </div>
            <div>
              <dt class="font-bold uppercase tracking-[1px] text-[#5f5a52] dark:text-[#d4cebf]">Provisional note</dt>
              <dd class="mt-0.5">${this.escape(entry.provisionalReason)}</dd>
            </div>
          </dl>
        </div>
      </article>
    `
  }

  private bindEntryDetails(container: HTMLElement) {
    container.querySelectorAll('[data-hunt-entry-toggle]').forEach(node => {
      node.addEventListener('click', () => {
        const button = node as HTMLButtonElement
        const entryId = button.dataset.huntEntryToggle || ''
        const expanded = button.getAttribute('aria-expanded') === 'true'
        this.setEntryDetailsOpen(entryId, !expanded)
      })
    })
  }

  private setEntryDetailsOpen(entryId: string, open: boolean) {
    const button = document.querySelector(`[data-hunt-entry-toggle="${CSS.escape(entryId)}"]`) as HTMLButtonElement | null
    const detail = document.querySelector(`[data-hunt-entry-detail="${CSS.escape(entryId)}"]`) as HTMLElement | null
    const card = document.querySelector(`[data-entry-id="${CSS.escape(entryId)}"]`) as HTMLElement | null

    if (button) {
      button.setAttribute('aria-expanded', open ? 'true' : 'false')
      button.textContent = open ? 'Hide details' : 'Details'
    }
    if (detail) detail.classList.toggle('hidden', !open)
    if (open) card?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }

  private renderControlNote(hasDraft: boolean, status: string, isBusy: boolean, canIterate: boolean) {
    if (!hasDraft) {
      if (status === 'failed') {
        return '<div class="mt-2 text-xs text-[#6b6761] dark:text-[#a39a8c]">No public data changed. Start a broader Hunt or use the deeper GitHub research path for source-backed discovery.</div>'
      }
      return '<div class="mt-2 text-xs text-[#6b6761] dark:text-[#a39a8c]">Draft controls unlock when the first queued job finishes.</div>'
    }
    if (isBusy) {
      return '<div class="mt-2 text-xs text-[#6b6761] dark:text-[#a39a8c]">A Hunt job is running. This page refreshes automatically.</div>'
    }
    if (!canIterate) {
      return '<div class="mt-2 text-xs text-[#6b6761] dark:text-[#a39a8c]">Iteration cap reached. Promotion sends this Hunt into the GitHub validation path.</div>'
    }
    return ''
  }

  private renderMap() {
    if (!this.state?.draftMap) return
    this.map?.remove()
    const mapContainer = document.getElementById('hunt-map')
    if (!mapContainer) return

    const entries = this.state.draftMap.entries
    const center = entries[0]
      ? [entries[0].location.lng, entries[0].location.lat] as [number, number]
      : [-73.7562, 42.6526] as [number, number]

    this.map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center,
      zoom: entries.length > 1 ? 8 : 10,
      attributionControl: false,
      pixelRatio: window.devicePixelRatio || 1,
    })

    this.map.on('load', () => {
      if (!this.map || this.disposed) return
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      for (const entry of entries) {
        const marker = document.createElement('button')
        marker.className = 'w-6 h-6 rounded-full bg-[#111] text-white text-[10px] font-bold border-2 border-white shadow'
        marker.textContent = '?'
        marker.title = entry.name
        marker.addEventListener('click', () => {
          this.setEntryDetailsOpen(entry.id, true)
        })
        new maplibregl.Marker({ element: marker })
          .setLngLat([entry.location.lng, entry.location.lat])
          .addTo(this.map!)
      }
      this.fitMap(entries)
    })
  }

  private fitMap(entries: DraftHuntEntry[]) {
    if (!this.map || entries.length < 2) return
    const bounds = new maplibregl.LngLatBounds()
    for (const entry of entries) bounds.extend([entry.location.lng, entry.location.lat])
    this.map.fitBounds(bounds, { padding: 60, maxZoom: 11, duration: 0 })
  }

  private formatAddress(entry: DraftHuntEntry) {
    return [
      entry.location.address,
      entry.location.city,
      entry.location.region,
      entry.location.country,
    ].filter(Boolean).join(', ')
  }

  private escape(value: unknown) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
  }

  private escapeAttr(value: unknown) {
    return this.escape(value)
  }

  private async handleIterate(container: HTMLElement) {
    const input = document.getElementById('iteration-instruction') as HTMLTextAreaElement | null
    const currentNames = this.state?.draftMap?.entries.map(entry => entry.name).join('; ') || ''
    const instruction = input?.value.trim() || [
      'Run a secondary quality hunt.',
      'Exclude every current entry by name and find a better replacement set.',
      currentNames ? `Current entries to exclude: ${currentNames}.` : '',
      'Suppress closed, stale, weakly evidenced, or rebranded places.',
      'Require exact street address, current operating evidence, concrete source URLs, and explicit topic-specific evidence for every accepted entry.',
    ].filter(Boolean).join(' ')
    container.querySelector('#iterate-btn')?.setAttribute('disabled', 'true')
    this.actionError = ''
    try {
      this.state = await iterateHunt(this.huntId, instruction)
      if (!this.disposed) {
        this.render(container)
        this.schedulePoll(container)
      }
    } catch (err) {
      this.actionError = err instanceof Error ? err.message : 'Iteration request failed'
      if (!this.disposed) this.render(container)
    }
  }

  private async handlePromote(container: HTMLElement) {
    container.querySelector('#promote-btn')?.setAttribute('disabled', 'true')
    this.actionError = ''
    try {
      const result = await promoteHunt(this.huntId)
      if (result.state) {
        this.state = result.state
      } else if (this.state) {
        this.state = {
          ...this.state,
          profile: {
            ...this.state.profile,
            status: 'promotion_queued',
            promotion: result.promotion,
          },
        }
      }
      if (!this.disposed) {
        this.render(container)
        this.schedulePoll(container)
      }
    } catch (err) {
      this.actionError = err instanceof Error ? err.message : 'Promotion request failed'
      if (!this.disposed) this.render(container)
    }
  }

  private schedulePoll(container: HTMLElement) {
    if (this.pollTimer) window.clearTimeout(this.pollTimer)
    if (!this.state || !this.shouldPoll()) return
    this.pollTimer = window.setTimeout(() => {
      void this.load(container)
    }, 3000)
  }

  private shouldPoll() {
    const status = this.state?.profile.status
    return status === 'queued' ||
      status === 'running' ||
      status === 'iterating' ||
      status === 'promotion_queued' ||
      status === 'promotion_dispatched'
  }
}
