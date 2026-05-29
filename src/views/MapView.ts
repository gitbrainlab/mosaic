/**
 * MapView - Mobile-first single map experience
 * Follows PWA research: bottom sheets for detail, persistent state, excellent touch targets.
 */

import maplibregl from 'maplibre-gl/dist/maplibre-gl.js'
import { loadMapManifest, loadEntries } from '../lib/data-loader'
import { BottomSheet, type SheetSnap } from '../components/BottomSheet'
import { goToGallery } from '../lib/router'
import type { KnowledgeEntry, MapManifest } from '../types'

export default class MapView {
  private map: maplibregl.Map | null = null
  private manifest: MapManifest | null = null
  private entries: KnowledgeEntry[] = []
  private filteredEntries: KnowledgeEntry[] = []
  private slug = ''
  private searchQuery = ''
  private mapReady = false
  private entriesReady = false
  private initialRenderComplete = false
  private resizeObserver: ResizeObserver | null = null
  private markerRenderFrame: number | null = null
  private resizeFrame: number | null = null
  private markerCursor = 0
  private disposed = false

  private markers: maplibregl.Marker[] = []
  private activeConfidenceFilter: 'all' | 'high' | 'medium' | 'low' = 'all'
  private currentSheet: BottomSheet | null = null
  private mobileListSheet: BottomSheet | null = null
  private desktopDetailPanel: HTMLDivElement | null = null
  private replacingSheet = false
  private selectedEntryId: string | null = null

  mount(container: HTMLElement, params: { slug: string }) {
    this.disposed = false
    this.slug = params.slug
    this.mapReady = false
    this.entriesReady = false
    this.initialRenderComplete = false

    container.innerHTML = `
      <div class="flex flex-col h-[100dvh] min-h-0 overflow-hidden">
        <div class="flex shrink-0 items-center justify-between px-3 py-2 border-b border-[#e5e2d9] dark:border-[#3f3b33] bg-[#f8f7f4] dark:bg-[#141310]">
          <button id="back-btn" class="min-h-11 px-3 text-sm flex items-center gap-1 text-[#4f4a42] dark:text-[#e8e4d9] rounded-md hover:bg-[#f1efea] dark:hover:bg-[#2a2924] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a8178]">
            ← Maps
          </button>
          <div class="font-medium text-center px-2 truncate" id="map-title">Loading...</div>
          <button id="show-list-header" class="min-h-11 min-w-11 text-sm px-4 rounded-md border border-[#a39a8c] text-[#2c2a27] dark:text-[#f1efea] hover:bg-[#f1efea] dark:hover:bg-[#2a2924] active:bg-[#e8e4d9] dark:active:bg-[#34312b] transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#8a8178]">List</button>
        </div>

        <div class="flex-1 min-h-0 flex flex-col md:flex-row relative">
          <div id="map" class="flex-1 min-h-0 h-full"></div>

          <div class="hidden lg:block w-80 border-l border-[#e5e2d9] dark:border-[#3f3b33] overflow-auto bg-white dark:bg-[#1a1916] h-full">
            <div class="p-3 border-b space-y-2">
              <input id="search" placeholder="Search..." class="w-full min-h-11 px-3 text-sm border border-[#a39a8c] bg-white dark:bg-[#141310] text-[#111] dark:text-[#f4f1e9] rounded-md focus:outline-none focus:border-[#5c5549]">
              <div class="flex gap-1 text-xs">
                <button class="filter-btn min-h-10 px-3 rounded-md border-2 border-[#1f1d1a] dark:border-[#d4cebf] bg-white dark:bg-[#141310] text-[#1f1d1a] dark:text-[#f4f1e9] font-bold hover:bg-[#f1efea] dark:hover:bg-[#2a2924] active" data-filter="all">All</button>
                <button class="filter-btn min-h-10 px-3 rounded-md border-2 border-[#1f1d1a] dark:border-[#d4cebf] bg-white dark:bg-[#141310] text-[#1f1d1a] dark:text-[#f4f1e9] font-bold hover:bg-[#f1efea] dark:hover:bg-[#2a2924]" data-filter="high">High</button>
                <button class="filter-btn min-h-10 px-3 rounded-md border-2 border-[#1f1d1a] dark:border-[#d4cebf] bg-white dark:bg-[#141310] text-[#1f1d1a] dark:text-[#f4f1e9] font-bold hover:bg-[#f1efea] dark:hover:bg-[#2a2924]" data-filter="medium">Medium</button>
                <button class="filter-btn min-h-10 px-3 rounded-md border-2 border-[#1f1d1a] dark:border-[#d4cebf] bg-white dark:bg-[#141310] text-[#1f1d1a] dark:text-[#f4f1e9] font-bold hover:bg-[#f1efea] dark:hover:bg-[#2a2924]" data-filter="low">Low</button>
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
    this.manifest = manifest
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
    window.addEventListener('orientationchange', this.onWindowResize)
    window.visualViewport?.addEventListener('resize', this.onWindowResize)
  }

  private onWindowResize = () => {
    if (!this.map || this.disposed) return

    if (this.resizeFrame !== null) {
      window.cancelAnimationFrame(this.resizeFrame)
    }

    this.resizeFrame = window.requestAnimationFrame(() => {
      this.resizeFrame = null
      if (!this.map || this.disposed) return

      this.map.setPixelRatio(window.devicePixelRatio || 1)
      this.map.resize()

      if (this.selectedEntryId) {
        const selected = this.entries.find(entry => entry.id === this.selectedEntryId)
        if (selected) {
          this.focusMapOnEntry(selected, Boolean(this.desktopDetailPanel))
        }
      }
    })
  }

  private completeInitialRender() {
    if (this.initialRenderComplete || !this.map || this.disposed) return
    this.initialRenderComplete = true

    this.renderList(this.getFilteredEntries())
    this.addMarkersIncrementally()
    const urlState = this.restoreStateFromURL()

    if (!urlState.hasCameraState && !urlState.hasSelectedEntry) {
      this.orientInitialCamera()
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

  private orientInitialCamera() {
    if (!this.map || this.entries.length === 0) return

    if (this.shouldFitToData()) {
      this.fitToEntries(this.entries, 60, 13)
      return
    }

    const cluster = this.findInitialCluster()
    if (cluster.length > 1) {
      this.fitToEntries(cluster, 80, 11)
      return
    }

    const first = this.entries[0]
    this.map.jumpTo({
      center: [first.location.lng, first.location.lat],
      zoom: Math.max(this.manifest?.defaultZoom || 8, 10),
    })
  }

  private fitToEntries(entries: KnowledgeEntry[], padding = 60, maxZoom = 13) {
    if (!this.map || entries.length === 0) return

    const bounds = new maplibregl.LngLatBounds()
    entries.forEach(entry => {
      if (typeof entry.location.lat === 'number' && typeof entry.location.lng === 'number') {
        bounds.extend([entry.location.lng, entry.location.lat])
      }
    })

    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds, {
        padding,
        maxZoom,
        duration: 700,
      })
    }
  }

  private findInitialCluster() {
    if (this.entries.length <= 1) return this.entries

    let bestEntry = this.entries[0]
    let bestScore = -1

    for (const candidate of this.entries) {
      const score = this.entries.reduce((count, entry) => {
        return count + (this.distanceKm(candidate, entry) <= 250 ? 1 : 0)
      }, 0)
      if (score > bestScore) {
        bestScore = score
        bestEntry = candidate
      }
    }

    const cluster = this.entries.filter(entry => this.distanceKm(bestEntry, entry) <= 250)
    return cluster.length > 0 ? cluster : [bestEntry]
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

  private renderList(filteredEntries = this.getFilteredEntries()) {
    this.filteredEntries = filteredEntries
    const listEl = document.getElementById('entry-list')
    if (!listEl) return

    if (filteredEntries.length === 0) {
      listEl.innerHTML = this.renderEmptyState()
      this.bindEmptyStateActions(listEl)
      this.updateMarkerVisibility()
      return
    }

    listEl.innerHTML = filteredEntries.map(entry => `
      <div class="p-3.5 hover:bg-[#f1efea] dark:hover:bg-[#2a2924] active:bg-[#e8e4d9] dark:active:bg-[#34312b] cursor-pointer entry-row border-l-[3px] border-transparent hover:border-[#1f1d1a] dark:hover:border-[#d4cebf] active:border-[#0a0a0a] transition-colors" data-id="${entry.id}">
        <div class="font-semibold text-[15px] text-[#0f0e0c] dark:text-[#f7f3ea]">${entry.name}</div>
        <div class="text-xs text-[#3f3b33] dark:text-[#d4cebf] mt-0.5">${entry.location.city}, ${entry.location.country}</div>
        <div class="text-[10px] mt-1.5 inline-block px-1.5 py-px rounded bg-[#f1efea] dark:bg-[#34312b] text-[#3f3b33] dark:text-[#f1efea] font-medium">${entry.confidence}</div>
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
    if (searchInput) {
      this.searchQuery = searchInput.value.trim()
    }

    this.renderList(this.getFilteredEntries())
    this.updateURLState()
  }

  private getFilteredEntries() {
    const q = this.searchQuery.toLowerCase().trim()

    return this.entries.filter(entry => {
      if (this.activeConfidenceFilter !== 'all' && entry.confidence !== this.activeConfidenceFilter) {
        return false
      }

      if (!q) return true

      return this.entrySearchText(entry).includes(q)
    })
  }

  private entrySearchText(entry: KnowledgeEntry) {
    return JSON.stringify({
      name: entry.name,
      city: entry.location.city,
      region: entry.location.region,
      country: entry.location.country,
      address: entry.location.address,
      description: entry.description,
      tags: entry.tags,
      attributes: entry.attributes,
      evidence: entry.evidence,
      sources: entry.sources,
      notes: entry.notes,
      historicalContext: entry.historicalContext,
      classification: entry.classification,
    }).toLowerCase()
  }

  private renderEmptyState() {
    const queryCopy = this.searchQuery ? ` for “${this.searchQuery}”` : ''
    const filterCopy = this.activeConfidenceFilter !== 'all' ? ` with ${this.activeConfidenceFilter} confidence` : ''
    return `
      <div class="p-5 text-sm text-[#2c2a27] dark:text-[#f1efea]" data-empty-state="search">
        <div class="font-semibold text-[#111] dark:text-white">No results${queryCopy}${filterCopy}</div>
        <div class="mt-1 text-[#5f5a52] dark:text-[#d4cebf]">Try a broader term, search another place attribute, or reset the filters.</div>
        <button data-action="reset-filters" class="mt-3 min-h-11 px-3 rounded-md border border-[#2c2a27] dark:border-[#d4cebf] text-[#111] dark:text-white hover:bg-[#f1efea] dark:hover:bg-[#2a2924]">Reset search</button>
      </div>
    `
  }

  private bindEmptyStateActions(root: ParentNode) {
    root.querySelector('[data-action="reset-filters"]')?.addEventListener('click', () => {
      this.resetFilters()
    })
  }

  private resetFilters() {
    this.searchQuery = ''
    this.activeConfidenceFilter = 'all'
    const searchInput = document.getElementById('search') as HTMLInputElement | null
    if (searchInput) searchInput.value = ''
    this.syncFilterButtons()
    this.renderList(this.getFilteredEntries())
    this.updateURLState()
  }

  private syncFilterButtons() {
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.classList.remove('active', '!bg-[#1f1d1a]', '!bg-[#0f0e0c]', '!text-white', '!border-[#0a0a0a]')
      if ((btn as HTMLElement).dataset.filter === this.activeConfidenceFilter) {
        btn.classList.add('active', '!bg-[#0f0e0c]', '!text-white', '!border-[#0a0a0a]')
      }
    })
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
        const filter = (btn as HTMLElement).dataset.filter as 'all' | 'high' | 'medium' | 'low'
        this.activeConfidenceFilter = filter
        this.syncFilterButtons()
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
    this.searchQuery = q || ''
    if (searchInput) searchInput.value = this.searchQuery

    const conf = params.get('confidence') as 'all' | 'high' | 'medium' | 'low' | null
    if (conf && ['all', 'high', 'medium', 'low'].includes(conf)) {
      this.activeConfidenceFilter = conf
    }
    this.syncFilterButtons()

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

    if (this.searchQuery) {
      url.searchParams.set('q', this.searchQuery)
    } else {
      url.searchParams.delete('q')
    }

    url.searchParams.set('confidence', this.activeConfidenceFilter)
    window.history.replaceState({}, '', url.toString())
  }

  private distanceKm(a: KnowledgeEntry, b: KnowledgeEntry) {
    const radiusKm = 6371
    const dLat = this.degToRad(b.location.lat - a.location.lat)
    const dLng = this.degToRad(b.location.lng - a.location.lng)
    const lat1 = this.degToRad(a.location.lat)
    const lat2 = this.degToRad(b.location.lat)

    const h =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(lat1) * Math.cos(lat2) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2)

    return radiusKm * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h))
  }

  private degToRad(value: number) {
    return value * Math.PI / 180
  }

  private showDetail(entry: KnowledgeEntry) {
    this.selectedEntryId = entry.id

    if (this.mobileListSheet) {
      this.mobileListSheet.close()
      this.mobileListSheet = null
    }

    if (this.currentSheet) {
      this.replacingSheet = true
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
      const sheetHeight = this.estimateMobileSheetHeight('peek')
      const verticalOffset = -Math.min(180, Math.max(76, Math.round(sheetHeight * 0.55)))

      this.map.easeTo({
        center: [entry.location.lng, entry.location.lat],
        zoom: Math.max(this.map.getZoom() || 8, 13),
        duration: 450,
        essential: true,
        offset: [0, verticalOffset],
      })
    }
  }

  private estimateMobileSheetHeight(snap: SheetSnap = 'peek') {
    const viewportHeight = Math.max(320, Math.round(window.visualViewport?.height || window.innerHeight))
    const fractions: Record<SheetSnap, number> = { peek: 0.22, half: 0.56, full: 0.94 }
    const requested = Math.round(viewportHeight * fractions[snap])
    const minHeight = snap === 'peek' ? Math.min(220, Math.round(viewportHeight * 0.34)) : Math.min(320, Math.round(viewportHeight * 0.7))
    const maxHeight = Math.max(220, viewportHeight - (window.innerWidth < 768 ? 88 : 72))
    return Math.max(120, Math.min(maxHeight, Math.max(minHeight, requested)))
  }

  private getVisualLanguage() {
    const haystack = `${this.slug} ${this.manifest?.title || ''} ${this.manifest?.tagline || ''} ${this.manifest?.intent?.statement || ''}`.toLowerCase()

    if (/(architecture|building|modernist|folk|tradition|craft|music|dance|festival|field)/.test(haystack)) {
      if (/(architecture|building|modernist)/.test(haystack)) {
        return {
          title: 'Visual documentation in progress',
          body: 'High-quality building imagery and source context are being curated for this profile.',
          action: 'Request visual refinement',
        }
      }

      return {
        title: 'Field documentation in progress',
        body: 'High-quality field images and source context are being curated for this tradition.',
        action: 'Request field-image refinement',
      }
    }

    return {
      title: 'Photos sourcing in progress',
      body: 'High-quality product photos are being sourced for this profile.',
      action: 'Request photo refinement',
    }
  }

  private renderNoPhotoState() {
    const language = this.getVisualLanguage()
    return `
      <div class="border border-dashed border-[#d4cebf] dark:border-[#3f3b33] rounded-lg p-4 bg-[#f8f7f4] dark:bg-[#1a1916]">
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#1f1d1a] dark:text-[#f4f1e9] mb-1">${language.title}</div>
        <div class="text-sm text-[#5f5a52] dark:text-[#d4cebf]">${language.body}</div>
        <button data-detail-action="request-refinement" class="mt-3 min-h-10 px-3 rounded-md border border-[#a39a8c] text-xs font-semibold text-[#2c2a27] dark:text-[#f1efea] hover:bg-[#f1efea] dark:hover:bg-[#2a2924]">${language.action}</button>
      </div>
    `
  }

  private renderDetailActionRail(entry: KnowledgeEntry) {
    const next = this.getNextNearbyEntry(entry)
    return `
      <div class="flex gap-2 overflow-x-auto pb-1" data-detail-actions>
        ${next ? `<button data-detail-action="next-nearby" class="flex-shrink-0 min-h-11 px-3 rounded-full bg-[#1f1d1a] text-white dark:bg-[#f1efea] dark:text-[#111] text-sm font-semibold">Next nearby</button>` : ''}
        <button data-detail-action="nearby-list" class="flex-shrink-0 min-h-11 px-3 rounded-full border border-[#a39a8c] text-[#2c2a27] dark:text-[#f1efea] text-sm font-semibold">Nearby entries</button>
        <button data-detail-action="request-refinement" class="flex-shrink-0 min-h-11 px-3 rounded-full border border-[#a39a8c] text-[#2c2a27] dark:text-[#f1efea] text-sm font-semibold">${this.getVisualLanguage().action}</button>
      </div>
    `
  }

  private bindDetailActions(root: ParentNode, entry: KnowledgeEntry) {
    root.querySelectorAll('[data-detail-action="next-nearby"]').forEach(button => {
      button.addEventListener('click', () => {
        const next = this.getNextNearbyEntry(entry)
        if (next) this.showDetail(next)
      })
    })

    root.querySelectorAll('[data-detail-action="nearby-list"]').forEach(button => {
      button.addEventListener('click', () => {
        if (window.innerWidth >= 1024) {
          document.getElementById('entry-list')?.scrollIntoView({ block: 'nearest' })
        } else {
          this.showMobileList()
        }
      })
    })

    root.querySelectorAll('[data-detail-action="request-refinement"]').forEach(button => {
      button.addEventListener('click', () => {
        const target = button as HTMLButtonElement
        target.textContent = 'Refinement noted'
        target.setAttribute('aria-live', 'polite')
      })
    })
  }

  private getNextNearbyEntry(entry: KnowledgeEntry) {
    const candidates = (this.filteredEntries.length > 1 ? this.filteredEntries : this.entries)
      .filter(candidate => candidate.id !== entry.id)

    return candidates
      .map(candidate => ({ candidate, distance: this.distanceKm(entry, candidate) }))
      .sort((a, b) => a.distance - b.distance)[0]?.candidate || null
  }

  private showDesktopDetailModal(entry: KnowledgeEntry) {
    if (!this.map) return

    const panel = document.createElement('div')
    panel.dataset.component = 'desktop-detail-panel'
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

      <div class="overflow-auto max-h-[45vh] p-4 text-[#0a0a0a] dark:text-white space-y-5 text-[15px]">
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
        ${this.renderNoPhotoState()}`}

        ${this.renderDetailActionRail(entry)}

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
      this.selectedEntryId = null
      this.setSelectedEntryInURL(null)
      if (this.map) {
        this.map.easeTo({ padding: { bottom: 0 }, duration: 250 })
      }
    }

    closeBtn.addEventListener('click', close)
    this.bindDetailActions(panel, entry)

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
        if (this.replacingSheet) {
          this.replacingSheet = false
          return
        }
        this.currentSheet = null
        this.selectedEntryId = null
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
      <div class="mb-4">${this.renderNoPhotoState()}</div>`}

      <div class="text-[15px] font-semibold leading-tight">
        ${entry.location.address}<br>
        ${entry.location.city}${entry.location.region ? ', ' + entry.location.region : ''}, ${entry.location.country}
      </div>

      ${this.renderDetailActionRail(entry)}

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
    this.bindDetailActions(content, entry)
    sheet.open('peek')
    this.currentSheet = sheet
    this.setSelectedEntryInURL(entry.id)
  }

  private showMobileList() {
    if (this.mobileListSheet) {
      this.mobileListSheet.close()
      this.mobileListSheet = null
    }

    if (this.currentSheet) {
      this.replacingSheet = true
      this.currentSheet.close()
      this.currentSheet = null
    }

    const sheet = new BottomSheet({
      title: 'Entries',
      snap: 'full',
      dismissible: true,
      modal: false,
      showHandle: true,
      onClose: () => {
        this.mobileListSheet = null
      },
    })

    const content = document.createElement('div')
    content.innerHTML = `
      <div class="mb-3">
        <input id="mobile-search" placeholder="Search entries..." value="${this.searchQuery}" class="w-full min-h-11 px-3 text-base border border-[#a39a8c] bg-white dark:bg-[#141310] text-[#111] dark:text-[#f4f1e9] rounded-md">
      </div>
      <div id="mobile-list" class="divide-y"></div>
    `

    const mobileSearch = content.querySelector('#mobile-search') as HTMLInputElement

    const renderMobileList = (filtered: KnowledgeEntry[]) => {
      const listContainer = content.querySelector('#mobile-list')!
      if (filtered.length === 0) {
        listContainer.innerHTML = this.renderEmptyState()
        listContainer.querySelector('[data-action="reset-filters"]')?.addEventListener('click', () => {
          this.resetFilters()
          mobileSearch.value = ''
          renderMobileList(this.filteredEntries)
        })
        return
      }

      listContainer.innerHTML = filtered.map(entry => `
        <div class="py-3.5 entry cursor-pointer active:bg-[#f1efea] dark:active:bg-[#2a2924] border-b border-[#e5e2d9] dark:border-[#3f3b33] last:border-b-0" data-id="${entry.id}">
          <div class="font-semibold text-[#0f0e0c] dark:text-[#f7f3ea]">${entry.name}</div>
          <div class="text-xs text-[#3f3b33] dark:text-[#d4cebf] mt-0.5">${entry.location.city}, ${entry.location.country}</div>
        </div>
      `).join('')

      listContainer.querySelectorAll('.entry').forEach(element => {
        element.addEventListener('click', () => {
          const id = (element as HTMLElement).dataset.id
          if (!id) return
          const entry = this.entries.find(item => item.id === id)
          if (entry) {
            sheet.close()
            this.mobileListSheet = null
            this.showDetail(entry)
          }
        })
      })
    }

    renderMobileList(this.getFilteredEntries())

    mobileSearch.addEventListener('input', () => {
      this.searchQuery = mobileSearch.value.trim()
      const desktopSearch = document.getElementById('search') as HTMLInputElement | null
      if (desktopSearch) desktopSearch.value = this.searchQuery
      const filtered = this.getFilteredEntries()
      this.renderList(filtered)
      renderMobileList(filtered)
      this.updateURLState()
    })

    sheet.setContent(content)
    sheet.open('full')
    this.mobileListSheet = sheet
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

    if (this.resizeFrame !== null) {
      window.cancelAnimationFrame(this.resizeFrame)
      this.resizeFrame = null
    }

    window.removeEventListener('resize', this.onWindowResize)
    window.removeEventListener('orientationchange', this.onWindowResize)
    window.visualViewport?.removeEventListener('resize', this.onWindowResize)

    this.currentSheet?.close()
    this.currentSheet = null

    this.mobileListSheet?.close()
    this.mobileListSheet = null

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
