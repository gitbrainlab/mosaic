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
    this.map?.remove()
    this.map = null
  }

  private async load(container: HTMLElement) {
    try {
      const result = await loadHunt(this.huntId)
      if (!result.data) throw new Error(result.error || 'Hunt not found')
      this.state = result.data
      if (!this.disposed) this.render(container)
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
    const canIterate = profile.iterationCount < profile.maxIterations
    const promotionUrl = profile.promotion?.githubIssueUrl || profile.promotion?.githubPrUrl

    container.innerHTML = `
      <div class="flex flex-col h-[calc(100dvh-4.25rem)] lg:h-[calc(100dvh-4.5rem)] min-h-0">
        <div class="flex items-center justify-between gap-3 px-3 py-2 border-b border-[#e5e2d9] dark:border-[#3f3b33] bg-[#f8f7f4] dark:bg-[#141310]">
          <button id="back-btn" class="min-h-11 px-3 text-sm rounded-md border border-[#a39a8c] text-[#2c2a27] dark:text-[#f1efea]">Maps</button>
          <div class="min-w-0 text-center">
            <div class="text-[10px] uppercase tracking-[1.4px] font-bold text-[#5f5a52] dark:text-[#d4cebf]">Public Draft Hunt</div>
            <div class="font-semibold truncate text-[#111] dark:text-white">${draftMap.title}</div>
          </div>
          <div class="text-[11px] px-2 py-1 rounded bg-[#1f1d1a] text-white dark:bg-white dark:text-[#111]">${profile.status}</div>
        </div>

        <div class="flex-1 min-h-0 grid lg:grid-cols-[minmax(0,1fr)_380px]">
          <div id="hunt-map" class="min-h-[42dvh] lg:min-h-0"></div>

          <aside class="overflow-auto bg-white dark:bg-[#1a1916] border-t lg:border-t-0 lg:border-l border-[#e5e2d9] dark:border-[#3f3b33]">
            <div class="p-4 border-b border-[#e5e2d9] dark:border-[#3f3b33]">
              <p class="text-sm leading-relaxed text-[#2c2a27] dark:text-[#e8e4d9]">${draftMap.narrative}</p>
              <div class="mt-3 flex flex-wrap gap-1.5">
                <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">Iteration ${profile.iterationCount}/${profile.maxIterations}</span>
                <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">${draftMap.entries.length} provisional entries</span>
                <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">${profile.spec.geography.label}</span>
              </div>
            </div>

            <div class="p-4 border-b border-[#e5e2d9] dark:border-[#3f3b33]">
              <div class="text-xs uppercase tracking-[1px] font-bold mb-2 text-[#3f3b33] dark:text-[#d4cebf]">Draft Controls</div>
              <textarea id="iteration-instruction" ${canIterate ? '' : 'disabled'} rows="3" class="w-full rounded border border-[#a39a8c] bg-[#f8f7f4] dark:bg-[#141310] text-[#111] dark:text-[#f4f1e9] p-2 text-sm" placeholder="Ask for one deeper pass, narrower scope, or more evidence focus."></textarea>
              <div class="mt-2 grid grid-cols-2 gap-2">
                <button id="iterate-btn" ${canIterate ? '' : 'disabled'} class="min-h-11 rounded bg-[#111] text-white dark:bg-white dark:text-[#111] text-sm font-semibold disabled:opacity-40">Deepen Draft</button>
                <button id="promote-btn" class="min-h-11 rounded border border-[#1f1d1a] dark:border-[#f4f1e9] text-sm font-semibold text-[#1f1d1a] dark:text-[#f4f1e9]">Promote</button>
              </div>
              ${promotionUrl ? `<a class="block mt-2 text-xs underline text-[#2c2a27] dark:text-[#e8e4d9]" href="${promotionUrl}" target="_blank" rel="noreferrer">Open GitHub promotion request</a>` : ''}
              ${canIterate ? '' : '<div class="mt-2 text-xs text-[#6b6761] dark:text-[#a39a8c]">Iteration cap reached. Promotion sends this Hunt into the GitHub review path.</div>'}
            </div>

            <div class="divide-y divide-[#e5e2d9] dark:divide-[#3f3b33]">
              ${draftMap.entries.map(entry => this.renderEntry(entry)).join('')}
            </div>

            ${draftMap.suppressedCandidates.length ? `
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
          </aside>
        </div>
      </div>
    `

    container.querySelector('#back-btn')?.addEventListener('click', goToGallery)
    container.querySelector('#iterate-btn')?.addEventListener('click', () => void this.handleIterate(container))
    container.querySelector('#promote-btn')?.addEventListener('click', () => void this.handlePromote(container))
    this.renderMap()
  }

  private renderEntry(entry: DraftHuntEntry) {
    return `
      <article class="p-4" data-entry-id="${entry.id}">
        <div class="flex items-start justify-between gap-3">
          <div>
            <h2 class="font-semibold text-[#111] dark:text-white">${entry.name}</h2>
            <div class="text-xs text-[#5f5a52] dark:text-[#d4cebf]">${entry.location.city}${entry.location.region ? `, ${entry.location.region}` : ''}</div>
          </div>
          <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">${entry.confidence}</span>
        </div>
        <p class="mt-2 text-sm leading-relaxed text-[#2c2a27] dark:text-[#e8e4d9]">${entry.summary}</p>
        <div class="mt-2 flex flex-wrap gap-1">
          <span class="text-[11px] px-2 py-1 rounded bg-[#f1efea] dark:bg-[#2a2924]">photo: ${entry.photoStatus}</span>
          ${entry.tags.slice(0, 4).map(tag => `<span class="text-[11px] px-2 py-1 rounded bg-[#f8f7f4] dark:bg-[#141310]">${tag}</span>`).join('')}
        </div>
        <div class="mt-2 text-xs text-[#6b6761] dark:text-[#a39a8c]">${entry.provisionalReason}</div>
      </article>
    `
  }

  private renderMap() {
    if (!this.state) return
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
          document.querySelector(`[data-entry-id="${entry.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
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

  private async handleIterate(container: HTMLElement) {
    const input = document.getElementById('iteration-instruction') as HTMLTextAreaElement | null
    const instruction = input?.value.trim() || 'Deepen evidence quality and improve coverage.'
    container.querySelector('#iterate-btn')?.setAttribute('disabled', 'true')
    this.state = await iterateHunt(this.huntId, instruction)
    if (!this.disposed) this.render(container)
  }

  private async handlePromote(container: HTMLElement) {
    container.querySelector('#promote-btn')?.setAttribute('disabled', 'true')
    const result = await promoteHunt(this.huntId)
    if (this.state) {
      this.state = {
        ...this.state,
        profile: {
          ...this.state.profile,
          status: 'promotion_requested',
          promotion: result.promotion,
        },
      }
    }
    if (!this.disposed) this.render(container)
  }
}
