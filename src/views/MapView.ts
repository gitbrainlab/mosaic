/**
 * MapView - Mobile-first single map experience
 * Follows PWA research: bottom sheets for detail, persistent state, excellent touch targets.
 */

import maplibregl from 'maplibre-gl/dist/maplibre-gl.js'
import { loadMapManifest, loadEntries } from '../lib/data-loader'
import { BottomSheet } from '../components/BottomSheet'
import { goToGallery } from '../lib/router'
import type { KnowledgeEntry } from '../types'

export default class MapView {
  private map: maplibregl.Map | null = null
  private entries: KnowledgeEntry[] = []
  private filteredEntries: KnowledgeEntry[] = []
  private slug = ''
  private mapReady = false
  private entriesReady = false
  private initialRenderComplete = false
  private resizeObserver: ResizeObserver | null = null
  private markerRenderFrame: number | null = null
  private markerCursor = 0
  private disposed = false

  private markers: maplibregl.Marker[] = []
  private activeConfidenceFilter: 'all' | 'high' | 'medium' | 'low' = 'all'
  private currentSheet: BottomSheet | null = null
  private desktopDetailPanel: HTMLDivElement | null = null

  mount(container: HTMLElement, params: { slug: string }) {
    this.disposed = false
    this.slug = params.slug
    this.mapReady = false
    this.entriesReady = false
    this.initialRenderComplete = false

    container.innerHTML = `
      <div class="flex flex-col h-[calc(100dvh-4.25rem)] lg:h-[calc(100dvh-4.5rem)] min-h-0">
        <div class="flex items-center justify-between px-4 py-3 border-b border-[#e5e2d9]">
          <button id="back-btn" class="text-sm flex items-center gap-1 text-[#6b6761]">
            ← Maps
          </button>
          <div class="font-medium text-center px-2 truncate" id="map-title">Loading...</div>
          <button id="show-list-header" class="text-sm px-3 py-1.5 rounded-md border border-[#a39a8c] text-[#3f3b33] dark:text-[#d4cebf] hover:bg-[#f1efea] dark:hover:bg-[#2a2924] active:bg-[#e8e4d9] transition-colors">List</button>
        </div>

        <div class="flex-1 min-h-0 flex flex-col md:flex-row relative">
          <div id="map" class="flex-1 min-h-0 h-full"></div>

          <div class="hidden lg:block w-80 border-l border-[#e5e2d9] overflow-auto bg-white h-full">
            <div class="p-3 border-b space-y-2">
              <input id="search" placeholder="Search..." class="w-full px-3 py-2 text-sm border border-[#a39a8c] bg-white rounded-md focus:outline-none focus:border-[#5c5549]">
              <div class="flex gap-1 text-xs">
                <button class="filter-btn px-3 py-1.5 rounded-md border-2 border-[#1f1d1a] bg-white text-[#1f1d1a] font-bold hover:bg-[#f1efea] active" data-filter="all">All</button>
                <button class="filter-btn px-3 py-1.5 rounded-md border-2 border-[#1f1d1a] bg-white text-[#1f1d1a] font-bold hover:bg-[#f1efea]" data-filter="high">High</button>
                <button class="filter-btn px-3 py-1.5 rounded-md border-2 border-[#1f1d1a] bg-white text-[#1f1d1a] font-bold hover:bg-[#f1efea]" data-filter="medium">Medium</button>
                <button class="filter-btn px-3 py-1.5 rounded-md border-2 border-[#1f1d1a] bg-white text-[#1f1d1a] font-bold hover:bg-[#f1efea]" data-filter="low">Low</button>
              </div>
            </div>
            <div id="entry-list" class="divide-y"></div>
          </div>
        </div>
      </div>
    `

    this.bindEvents()
    void this.initMap()
  }

  private async initMap() {
    const mapContainer = document.getElementById('map')
    if (!mapContainer) return

    const manifestResult = await loadMapManifest(this.slug)
    if (this.disposed) return

    if (!manifestResult.data) {
      mapContainer.innerHTML = `<div class="p-8 text-red-600">Failed to load map manifest.</div>`
      return
    }

    const manifest = manifestResult.data
    document.getElementById('map-title')!.textContent = manifest.title

    const loadingOverlay = document.createElement('div')
    loadingOverlay.className = 'absolute inset-0 bg-[#f8f7f4] dark:bg-[#1a1916] flex items-center justify-center text-sm text-[#6b6761] pointer-events-none'
    loadingOverlay.textContent = 'Loading map…'
    mapContainer.style.position = 'relative'
    mapContainer.appendChild(loadingOverlay)

    const entriesPromise = loadEntries(this.slug)

    this.map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [manifest.defaultCenter[1], manifest.defaultCenter[0]],
      zoom: manifest.defaultZoom,
      attributionControl: false,
      pixelRatio: window.devicePixelRatio || 1,
    })

    this.map.on('load', () => {
      if (this.disposed || !this.map) return
      this.mapReady = true
      loadingOverlay.remove()
      this.map.setPixelRatio(window.devicePixelRatio || 1)
      this.map.resize()
      this.observeMapSizing(mapContainer)
      this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      this.map.on('moveend', () => this.updateURLState())
      if (this.entriesReady) {
        this.completeInitialRender()
      }
    })

    entriesPromise.then(entriesResult => {
      if (this.disposed) return
      this.entries = entriesResult.data || []
      this.entriesReady = true
      this.filteredEntries = [...this.entries]
      if (this.mapReady) {
        this.completeInitialRender()
      }
    }).catch(() => {
      if (this.disposed) return
      this.entries = []
      this.entriesReady = true
      if (this.mapReady) {
        this.completeInitialRender()
      }
    })
  }

  private observeMapSizing(mapContainer: HTMLElement) {
    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
    }

    this.resizeObserver = new ResizeObserver(() => {
      if (!this.map) return
      requestAnimationFrame(() => {
        if (this.map && !this.disposed) {
          this.map.resize()
        }
      })
    })

    this.resizeObserver.observe(mapContainer)
    window.addEventListener('resize', this.onWindowResize)
  }

  private onWindowResize = () => {
    if (!this.map || this.disposed) return
    this.map.resize()
  }

  private completeInitialRender() {
    if (this.initialRenderComplete || !this.map || this.disposed) return
    this.initialRenderComplete = true

    this.renderList()
    this.addMarkersIncrementally()
    const urlState = this.restoreStateFromURL()

    // Large national maps feel better when we keep the default camera stable.
    // Smaller regional maps can still be snugged to the data if it is not sprawling.
    if (!urlState.hasCameraState && !urlState.hasSelectedEntry && this.shouldFitToData()) {
      this.fitToData()
    }

    requestAnimationFrame(() => this.map?.resize())
  }

  private shouldFitToData() {
    if (this.entries.length === 0) return false
    if (this.entries.length > 120) return false

    let minLat = Infinity
    let maxLat = -Infinity
    let minLng = Infinity
    let maxLng = -Infinity

    for (const entry of this.entries) {
      minLat = Math.min(minLat, entry.location.lat)
      maxLat = Math.max(maxLat, entry.location.lat)
      minLng = Math.min(minLng, entry.location.lng)
      maxLng = Math.max(maxLng, entry.location.lng)
    }

    const latSpan = maxLat - minLat
    const lngSpan = maxLng - minLng
    return latSpan < 8 && lngSpan < 8
  }

  private fitToData() {
    if (!this.map || this.entries.length === 0) return

    const bounds = new maplibregl.LngLatBounds()
    this.entries.forEach(entry => {
      if (typeof entry.location.lat === 'number' && typeof entry.location.lng === 'number') {
        bounds.extend([entry.location.lng, entry.location.lat])
      }
    })

    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds, {
        padding: 60,
        maxZoom: 13,
        duration: 700,
      })
    }
  }

  private addMarkersIncrementally() {
    if (!this.map) return

    this.markers.forEach(marker => marker.remove())
    this.markers = []
    this.markerCursor = 0

    if (this.markerRenderFrame !== null) {
      cancelAnimationFrame(this.markerRenderFrame)
      this.markerRenderFrame = null
    }

    const batchSize = 60
    const addBatch = () => {
      if (!this.map || this.disposed) return

      const batch = this.entries.slice(this.markerCursor, this.markerCursor + batchSize)
      for (const entry of batch) {
        const el = document.createElement('div')
        el.className = 'w-4 h-4 rounded-full bg-[#5c5549] border-[3px] border-white shadow-md cursor-pointer ring-1 ring-[#2c2a27]/20'
        el.dataset.id = entry.id

        const marker = new maplibregl.Marker({ element: el })
          .setLngLat([entry.location.lng, entry.location.lat])
          .addTo(this.map)

        el.addEventListener('click', () => this.showDetail(entry))
        this.markers.push(marker)
      }

      this.markerCursor += batch.length
      this.updateMarkerVisibility()

      if (this.markerCursor < this.entries.length) {
        this.markerRenderFrame = window.requestAnimationFrame(addBatch)
      }
    }

    addBatch()
  }

  private renderList(filteredEntries = this.entries) {
    this.filteredEntries = filteredEntries
    const listEl = document.getElementById('entry-list')
    if (!listEl) return

    listEl.innerHTML = filteredEntries.map(entry => `
      <div class="p-3.5 hover:bg-[#f1efea] active:bg-[#e8e4d9] cursor-pointer entry-row border-l-[3px] border-transparent hover:border-[#1f1d1a] active:border-[#0a0a0a] transition-colors" data-id="${entry.id}">
        <div class="font-semibold text-[15px] text-[#0f0e0c]">${entry.name}</div>
        <div class="text-xs text-[#3f3b33] mt-0.5">${entry.location.city}, ${entry.location.country}</div>
        <div class="text-[10px] mt-1.5 inline-block px-1.5 py-px rounded bg-[#f1efea] text-[#3f3b33] font-medium">${entry.confidence}</div>
      </div>
    `).join('')

    listEl.querySelectorAll('.entry-row').forEach(row => {
      row.addEventListener('click', () => {
        const id = (row as HTMLElement).dataset.id
        if (!id) return
        const entry = this.entries.find(item => item.id === id)
        if (entry) {
          this.showDetail(entry)
        }
      })
    })

    this.updateMarkerVisibility()
  }

  private updateMarkerVisibility() {
    const visibleIds = new Set(this.filteredEntries.map(entry => entry.id))
    this.markers.forEach(marker => {
      const element = marker.getElement()
      const id = element.dataset.id
      element.style.display = id && visibleIds.has(id) ? 'block' : 'none'
    })
  }

  private applyFilters() {
    const searchInput = document.getElementById('search') as HTMLInputElement | null
    const q = (searchInput?.value || '').toLowerCase().trim()

    const filtered = this.entries.filter(entry => {
      if (this.activeConfidenceFilter !== 'all' && entry.confidence !== this.activeConfidenceFilter) {
        return false
      }

      if (!q) return true

      return (
        entry.name.toLowerCase().includes(q) ||
        entry.location.city.toLowerCase().includes(q) ||
        entry.description.toLowerCase().includes(q)
      )
    })

    this.renderList(filtered)
    this.updateURLState()
  }

  private bindEvents() {
    document.getElementById('back-btn')?.addEventListener('click', () => {
      goToGallery()
    })

    const search = document.getElementById('search') as HTMLInputElement | null
    search?.addEventListener('input', () => {
      this.applyFilters()
    })

    document.getElementById('show-list-header')?.addEventListener('click', () => {
      this.showMobileList()
    })

    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(candidate => {
          candidate.classList.remove('active', '!bg-[#1f1d1a]', '!text-white', '!border-[#0a0a0a]')
        })
        btn.classList.add('active', '!bg-[#0f0e0c]', '!text-white', '!border-[#0a0a0a]')
        const filter = (btn as HTMLElement).dataset.filter as 'all' | 'high' | 'medium' | 'low'
        this.activeConfidenceFilter = filter
        this.applyFilters()
      })
    })
  }

  private restoreStateFromURL() {
    if (!this.map || this.disposed) {
      return { hasCameraState: false, hasSelectedEntry: false }
    }

    const url = new URL(window.location.href)
    const params = url.searchParams

    const lat = parseFloat(params.get('lat') || '')
    const lng = parseFloat(params.get('lng') || '')
    const zoom = parseFloat(params.get('zoom') || '')

    const hasCameraState = !isNaN(lat) && !isNaN(lng) && !isNaN(zoom)
    if (hasCameraState) {
      this.map.jumpTo({ center: [lng, lat], zoom })
    }

    const searchInput = document.getElementById('search') as HTMLInputElement | null
    const q = params.get('q')
    if (q && searchInput) {
      searchInput.value = q
    }

    const conf = params.get('confidence') as 'all' | 'high' | 'medium' | 'low' | null
    if (conf) {
      this.activeConfidenceFilter = conf
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active', '!bg-[#1f1d1a]', '!text-white', '!border-[#0a0a0a]')
        if ((btn as HTMLElement).dataset.filter === conf) {
          btn.classList.add('active', '!bg-[#0f0e0c]', '!text-white', '!border-[#0a0a0a]')
        }
      })
    }

    this.applyFilters()

    const selectedId = params.get('entry')
    let hasSelectedEntry = false
    if (selectedId) {
      hasSelectedEntry = true
      const entry = this.entries.find(item => item.id === selectedId)
      if (entry) {
        window.setTimeout(() => this.showDetail(entry), 250)
      }
    }

    return { hasCameraState, hasSelectedEntry }
  }

  private updateURLState() {
    if (!this.map || this.disposed) return

    const center = this.map.getCenter()
    const zoom = this.map.getZoom()
    const url = new URL(window.location.href)

    url.searchParams.set('lat', center.lat.toFixed(5))
    url.searchParams.set('lng', center.lng.toFixed(5))
    url.searchParams.set('zoom', zoom.toFixed(2))

    const searchInput = document.getElementById('search') as HTMLInputElement | null
    if (searchInput?.value) {
      url.searchParams.set('q', searchInput.value)
    } else {
      url.searchParams.delete('q')
    }

    url.searchParams.set('confidence', this.activeConfidenceFilter)
    window.history.replaceState({}, '', url.toString())
  }

  private showDetail(entry: KnowledgeEntry) {
    if (this.currentSheet) {
      this.currentSheet.close()
      this.currentSheet = null
    }

    if (this.desktopDetailPanel) {
      this.desktopDetailPanel.remove()
      this.desktopDetailPanel = null
    }

    const isDesktop = window.innerWidth >= 1024
    this.focusMapOnEntry(entry, isDesktop)

    if (isDesktop) {
      this.showDesktopDetailModal(entry)
    } else {
      this.showMobileBottomSheet(entry)
    }
  }

  private focusMapOnEntry(entry: KnowledgeEntry, desktop = false) {
    if (!this.map || typeof entry.location.lat !== 'number' || typeof entry.location.lng !== 'number') {
      return
    }

    if (desktop) {
      this.map.easeTo({
        center: [entry.location.lng, entry.location.lat],
        zoom: Math.max(this.map.getZoom() || 8, 13),
        duration: 550,
        padding: { bottom: 320 },
      })
    } else {
      this.map.flyTo({
        center: [entry.location.lng, entry.location.lat],
        zoom: Math.max(this.map.getZoom() || 8, 13),
        duration: 550,
        essential: true,
      })
    }
  }

  private showDesktopDetailModal(entry: KnowledgeEntry) {
    if (!this.map) return

    const panel = document.createElement('div')
    panel.className = `
      fixed bottom-0 left-0 right-0 z-[250]
      bg-white dark:bg-[#1a1916] border-t border-[#e5e2d9] dark:border-[#3f3b33]
      shadow-2xl flex flex-col
    `

    panel.innerHTML = `
      <div class="flex items-center justify-between px-4 py-3 border-b border-[#e5e2d9] dark:border-[#3f3b33] flex-shrink-0">
        <div>
          <h2 class="text-lg font-semibold text-[#0a0a0a] dark:text-white">${entry.name}</h2>
          <div class="text-sm text-[#6b6761] dark:text-[#a39a8c]">
            ${entry.location.city}, ${entry.location.region || entry.location.country}
          </div>
        </div>
        <button aria-label="Close" class="text-2xl leading-none text-[#6b6761] hover:text-black dark:hover:text-white px-2">×</button>
      </div>

      <div class="overflow-auto max-h-[55vh] p-4 text-[#0a0a0a] dark:text-white space-y-5 text-[15px]">
        ${entry.photos && entry.photos.length > 0 ? `
        <div>
          <div class="text-xs uppercase tracking-[1px] font-bold text-[#1f1d1a] dark:text-[#d4cebf] mb-2">Photos</div>
          <div class="flex gap-3 overflow-x-auto pb-2">
            ${entry.photos.map(photo => `
              <div class="flex-shrink-0 w-72 border border-[#e5e2d9] dark:border-[#3f3b33] rounded-lg overflow-hidden">
                <img src="${this.normalizePhotoUrl(photo.url, this.slug)}" alt="${photo.caption}" class="w-72 h-48 object-cover" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=\\'p-3 text-xs text-[#6b6761] dark:text-[#a39a8c]\\'>Photo unavailable</div>')" />
                <div class="p-3 text-sm text-[#3f3b33] dark:text-[#d4cebf]">${photo.caption}</div>
              </div>
            `).join('')}
          </div>
        </div>` : `
        <div class="border border-dashed border-[#d4cebf] dark:border-[#3f3b33] rounded-lg p-4 bg-[#f8f7f4] dark:bg-[#1a1916]">
          <div class="text-xs uppercase tracking-[1px] font-bold text-[#1f1d1a] dark:text-[#d4cebf] mb-1">Photos sourcing in progress</div>
          <div class="text-sm text-[#6b6761] dark:text-[#a39a8c]">High-quality product photos are being sourced for this profile.</div>
        </div>`}

        <div class="leading-relaxed">${entry.description}</div>

        <div>
          <div class="text-xs uppercase tracking-[1px] font-bold text-[#1f1d1a] dark:text-[#d4cebf] mb-2">Evidence</div>
          <div class="space-y-3 text-sm">
            ${entry.evidence.map(ev => `
              <div class="border-l-[3px] border-[#1f1d1a] dark:border-[#a39a8c] pl-3">
                <div class="font-semibold">${ev.source}</div>
                ${ev.detail ? `<div class="mt-0.5">${ev.detail}</div>` : ''}
                ${ev.date ? `<div class="text-xs text-[#3a3a3a] dark:text-[#a39a8c] mt-0.5">${ev.date}</div>` : ''}
              </div>
            `).join('')}
          </div>
        </div>

        <div class="inline-flex items-center text-sm px-3 py-1 rounded-full bg-[#f1efea] dark:bg-[#2a2924] text-[#1f1d1a] dark:text-[#d4cebf] font-medium">
          Confidence: <span class="font-bold ml-1">${entry.confidence}</span>
        </div>
      </div>
    `

    const closeBtn = panel.querySelector('button')!
    const close = () => {
      panel.remove()
      this.desktopDetailPanel = null
      this.setSelectedEntryInURL(null)
      if (this.map) {
        this.map.easeTo({ padding: { bottom: 0 }, duration: 250 })
      }
    }

    closeBtn.addEventListener('click', close)

    const escHandler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close()
        document.removeEventListener('keydown', escHandler)
      }
    }
    document.addEventListener('keydown', escHandler, { once: true })

    document.body.appendChild(panel)
    this.desktopDetailPanel = panel
    this.setSelectedEntryInURL(entry.id)
  }

  private showMobileBottomSheet(entry: KnowledgeEntry) {
    const sheet = new BottomSheet({
      title: entry.name,
      snap: 'half',
      snapPoints: [0.22, 0.56, 0.94],
      dismissible: true,
      modal: false,
      showHandle: true,
      onClose: () => {
        this.currentSheet = null
        this.setSelectedEntryInURL(null)
      },
    })

    const content = document.createElement('div')
    content.className = 'space-y-4 text-[#0a0a0a] dark:text-white'

    const heroPhoto = entry.photos && entry.photos.length > 0 ? entry.photos[0] : null
    content.innerHTML = `
      ${heroPhoto ? `
      <div class="-mx-4 -mt-4 mb-4">
        <img src="${this.normalizePhotoUrl(heroPhoto.url, this.slug)}" alt="${heroPhoto.caption}" class="w-full h-44 object-cover" onerror="this.style.display='none'; this.parentElement.innerHTML = '<div class=\\'border border-dashed border-[#d4cebf] rounded p-3 text-xs text-[#6b6761]\\'>Photo unavailable (sourcing in progress)</div>'" />
        <div class="px-4 py-2 text-xs text-[#3f3b33] dark:text-[#d4cebf] bg-[#f8f7f4] dark:bg-[#1a1916]">${heroPhoto.caption}</div>
      </div>` : `
      <div class="border border-dashed border-[#d4cebf] dark:border-[#3f3b33] rounded-lg p-4 bg-[#f8f7f4] dark:bg-[#1a1916] mb-4">
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#1f1d1a] dark:text-[#d4cebf] mb-1">Photos sourcing in progress</div>
        <div class="text-sm text-[#6b6761] dark:text-[#a39a8c]">High-quality product photos are being sourced.</div>
      </div>`}

      <div class="text-[15px] font-semibold leading-tight">
        ${entry.location.address}<br>
        ${entry.location.city}${entry.location.region ? ', ' + entry.location.region : ''}, ${entry.location.country}
      </div>

      <div class="text-[15px] leading-snug">${entry.description}</div>

      ${entry.photos && entry.photos.length > 1 ? `
      <div>
        <div class="text-xs uppercase tracking-[1px] font-bold mb-2">More photos</div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          ${entry.photos.slice(1).map(photo => `
            <div class="flex-shrink-0 w-40 border border-[#e5e2d9] rounded overflow-hidden">
              <img src="${this.normalizePhotoUrl(photo.url, this.slug)}" class="w-40 h-24 object-cover" onerror="this.style.display='none'" />
              <div class="p-2 text-xs">${photo.caption}</div>
            </div>
          `).join('')}
        </div>
      </div>` : ''}

      <div>
        <div class="text-xs uppercase tracking-[1px] font-bold mb-2">Evidence</div>
        <div class="space-y-3 text-sm">
          ${entry.evidence.map(ev => `
            <div class="border-l-[3px] pl-3">
              <div class="font-semibold">${ev.source}</div>
              ${ev.detail ? `<div class="mt-0.5">${ev.detail}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="text-sm">Confidence: <span class="font-bold">${entry.confidence}</span></div>
    `

    sheet.setContent(content)
    sheet.open('peek')
    this.currentSheet = sheet
    this.setSelectedEntryInURL(entry.id)
  }

  private showMobileList() {
    const sheet = new BottomSheet({
      title: 'Entries',
      snap: 'full',
      dismissible: true,
    })

    const content = document.createElement('div')
    content.innerHTML = `
      <div class="mb-3">
        <input id="mobile-search" placeholder="Search entries..." class="w-full px-3 py-2 text-sm border rounded-md">
      </div>
      <div id="mobile-list" class="divide-y"></div>
    `

    const renderMobileList = (filtered: KnowledgeEntry[]) => {
      const listContainer = content.querySelector('#mobile-list')!
      listContainer.innerHTML = filtered.map(entry => `
        <div class="py-3.5 entry cursor-pointer active:bg-[#f1efea] dark:active:bg-[#2a2924] border-b border-[#e5e2d9] last:border-b-0" data-id="${entry.id}">
          <div class="font-semibold text-[#0f0e0c]">${entry.name}</div>
          <div class="text-xs text-[#3f3b33] mt-0.5">${entry.location.city}, ${entry.location.country}</div>
        </div>
      `).join('')

      listContainer.querySelectorAll('.entry').forEach(element => {
        element.addEventListener('click', () => {
          const id = (element as HTMLElement).dataset.id
          if (!id) return
          const entry = this.entries.find(item => item.id === id)
          if (entry) {
            sheet.close()
            this.showDetail(entry)
          }
        })
      })
    }

    renderMobileList(this.entries)

    const mobileSearch = content.querySelector('#mobile-search') as HTMLInputElement
    mobileSearch.addEventListener('input', () => {
      const q = mobileSearch.value.toLowerCase().trim()
      const filtered = this.entries.filter(entry =>
        entry.name.toLowerCase().includes(q) ||
        entry.location.city.toLowerCase().includes(q)
      )
      renderMobileList(filtered)
    })

    sheet.setContent(content)
    sheet.open('full')
  }

  private setSelectedEntryInURL(id: string | null) {
    const url = new URL(window.location.href)
    if (id) {
      url.searchParams.set('entry', id)
    } else {
      url.searchParams.delete('entry')
    }
    window.history.replaceState({}, '', url.toString())
  }

  private normalizePhotoUrl(url: string, slug: string): string {
    if (!url) return url
    if (url.startsWith('http')) return url
    if (url.startsWith('./images/')) {
      const filename = url.replace('./images/', '')
      return `${import.meta.env.BASE_URL}data/maps/${slug}/images/${filename}`.replace(/\/+/g, '/')
    }
    if (url.startsWith('images/')) {
      return `${import.meta.env.BASE_URL}data/maps/${slug}/images/${url.replace('images/', '')}`.replace(/\/+/g, '/')
    }
    if (url.startsWith('data/')) {
      return `${import.meta.env.BASE_URL}${url}`.replace(/\/+/g, '/')
    }
    return url
  }

  unmount() {
    this.disposed = true

    if (this.resizeObserver) {
      this.resizeObserver.disconnect()
      this.resizeObserver = null
    }

    if (this.markerRenderFrame !== null) {
      window.cancelAnimationFrame(this.markerRenderFrame)
      this.markerRenderFrame = null
    }

    window.removeEventListener('resize', this.onWindowResize)

    this.currentSheet?.close()
    this.currentSheet = null

    this.desktopDetailPanel?.remove()
    this.desktopDetailPanel = null

    this.markers.forEach(marker => marker.remove())
    this.markers = []

    if (this.map) {
      this.map.remove()
      this.map = null
    }
  }
}
