/**
 * MapView — Mobile-first single map experience
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
  private slug = ''
  private _container: HTMLElement | null = null // used in future for sheet anchoring etc.

  mount(container: HTMLElement, params: { slug: string }) {
    this._container = container
    this.slug = params.slug

    container.innerHTML = `
      <div class="flex flex-col h-[calc(100vh-3.5rem)]">
        <!-- Header -->
        <div class="flex items-center justify-between px-4 py-3 border-b border-[#e5e2d9]">
          <button id="back-btn" class="text-sm flex items-center gap-1 text-[#6b6761]">
            ← Maps
          </button>
          <div class="font-medium" id="map-title">Loading...</div>
          <button id="show-list-header" class="text-sm px-3 py-1.5 rounded-md border border-[#a39a8c] text-[#3f3b33] dark:text-[#d4cebf] hover:bg-[#f1efea] dark:hover:bg-[#2a2924] active:bg-[#e8e4d9] transition-colors">List</button>
        </div>

        <!-- Map + List area -->
        <div class="flex-1 flex flex-col md:flex-row relative">
          <!-- Map -->
          <div id="map" class="flex-1 min-h-[50vh]"></div>

          <!-- Sidebar list (large desktop only) -->
          <div class="hidden lg:block w-80 border-l border-[#e5e2d9] overflow-auto bg-white">
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

    this.initMap()
    this.bindEvents()
    this.restoreStateFromURL()
  }

  private async initMap() {
    const mapContainer = document.getElementById('map')!

    const manifestResult = await loadMapManifest(this.slug)
    if (!manifestResult.data) {
      mapContainer.innerHTML = `<div class="p-8 text-red-600">Failed to load map manifest.</div>`
      return
    }

    const manifest = manifestResult.data
    document.getElementById('map-title')!.textContent = manifest.title

    const entriesResult = await loadEntries(this.slug)
    this.entries = entriesResult.data || []

    this.map = new maplibregl.Map({
      container: mapContainer,
      style: 'https://tiles.openfreemap.org/styles/liberty',
      center: [manifest.defaultCenter[1], manifest.defaultCenter[0]],
      zoom: manifest.defaultZoom,
      attributionControl: false,
    })

    // Subtle loading overlay so user doesn't see raw beige/empty map
    const loadingOverlay = document.createElement('div')
    loadingOverlay.className = 'absolute inset-0 bg-[#f8f7f4] dark:bg-[#1a1916] flex items-center justify-center text-sm text-[#6b6761] pointer-events-none'
    loadingOverlay.textContent = 'Loading map…'
    mapContainer.style.position = 'relative'
    mapContainer.appendChild(loadingOverlay)

    this.map.on('load', () => {
      loadingOverlay.remove()
    })

    this.map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')

    this.map.on('load', () => {
      this.addMarkers()
      this.renderList()

      // Immediately fit the map to the actual data so user doesn't land on empty/beige view
      this.fitToData()

      // On first load with no prior selection, auto-open the first item so user has something interesting to look at immediately
      if (!this.hasRestoredSelection) {
        const first = this.entries[0]
        if (first) {
          // Small delay so the fit animation finishes
          setTimeout(() => this.showDetail(first), 900)
        }
      }

      // Persist camera on move
      this.map!.on('moveend', () => this.updateURLState())
    })
  }

  private fitToData() {
    if (!this.map || this.entries.length === 0) return

    const bounds = new maplibregl.LngLatBounds()

    this.entries.forEach(entry => {
      if (entry.location.lat && entry.location.lng) {
        bounds.extend([entry.location.lng, entry.location.lat])
      }
    })

    if (!bounds.isEmpty()) {
      this.map.fitBounds(bounds, {
        padding: 60,
        maxZoom: 13,
        duration: 800
      })
    }
  }

  private markers: maplibregl.Marker[] = []
  private filteredEntries: KnowledgeEntry[] = []
  private activeConfidenceFilter: 'all' | 'high' | 'medium' | 'low' = 'all'

  private addMarkers() {
    if (!this.map) return

    this.entries.forEach(entry => {
      const el = document.createElement('div')
      el.className = 'w-4 h-4 rounded-full bg-[#5c5549] border-[3px] border-white shadow-md cursor-pointer ring-1 ring-[#2c2a27]/20'
      el.dataset.id = entry.id

      const marker = new maplibregl.Marker({ element: el })
        .setLngLat([entry.location.lng, entry.location.lat])
        .addTo(this.map!)

      el.addEventListener('click', () => this.showDetail(entry))
      this.markers.push(marker)
    })
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
        const id = (row as HTMLElement).dataset.id!
        console.log('[MapView] List item clicked:', id)
        const entry = this.entries.find(e => e.id === id)
        if (entry) {
          this.showDetail(entry)
        } else {
          console.warn('[MapView] No entry found for id', id)
        }
      })
    })

    this.updateMarkerVisibility()
  }

  private updateMarkerVisibility() {
    const visibleIds = new Set(this.filteredEntries.map(e => e.id))

    this.markers.forEach(marker => {
      const el = marker.getElement()
      const id = el.dataset.id
      if (id && visibleIds.has(id)) {
        el.style.display = 'block'
      } else {
        el.style.display = 'none'
      }
    })
  }

  private applyFilters() {
    const searchInput = document.getElementById('search') as HTMLInputElement | null
    const q = (searchInput?.value || '').toLowerCase().trim()

    const filtered = this.entries.filter(entry => {
      // Confidence filter
      if (this.activeConfidenceFilter !== 'all' && entry.confidence !== this.activeConfidenceFilter) {
        return false
      }

      // Text search
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
    const back = document.getElementById('back-btn')
    back?.addEventListener('click', () => {
      goToGallery()
    })

    // Search (desktop sidebar)
    const search = document.getElementById('search') as HTMLInputElement
    search?.addEventListener('input', () => {
      this.applyFilters()
    })

    // Mobile + header list button (replaces bottom bar to avoid nav occlusion)
    document.getElementById('show-list-header')?.addEventListener('click', () => {
      this.showMobileList()
    })

    // Confidence filter buttons (desktop)
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active', '!bg-[#1f1d1a]', '!text-white', '!border-[#0a0a0a]'))
        btn.classList.add('active', '!bg-[#0f0e0c]', '!text-white', '!border-[#0a0a0a]')

        const filter = (btn as HTMLElement).dataset.filter as 'all' | 'high' | 'medium' | 'low'
        this.activeConfidenceFilter = filter
        this.applyFilters()
      })
    })
  }

  private hasRestoredSelection = false

  private restoreStateFromURL() {
    if (!this.map) return
    const url = new URL(window.location.href)
    const params = url.searchParams

    // Restore camera
    const lat = parseFloat(params.get('lat') || '')
    const lng = parseFloat(params.get('lng') || '')
    const zoom = parseFloat(params.get('zoom') || '')

    if (!isNaN(lat) && !isNaN(lng) && !isNaN(zoom)) {
      this.map.jumpTo({ center: [lng, lat], zoom })
    }

    // Restore search
    const q = params.get('q')
    const searchInput = document.getElementById('search') as HTMLInputElement | null
    if (q && searchInput) {
      searchInput.value = q
    }

    // Restore confidence filter
    const conf = params.get('confidence') as 'all' | 'high' | 'medium' | 'low' | null
    if (conf) {
      this.activeConfidenceFilter = conf
      // Highlight correct button
      document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active', '!bg-[#1f1d1a]', '!text-white', '!border-[#0a0a0a]')
        if ((btn as HTMLElement).dataset.filter === conf) {
          btn.classList.add('active', '!bg-[#0f0e0c]', '!text-white', '!border-[#0a0a0a]')
        }
      })
    }

    this.applyFilters()

    // Restore selected entry
    const selectedId = params.get('entry')
    if (selectedId) {
      this.hasRestoredSelection = true
      const entry = this.entries.find(e => e.id === selectedId)
      if (entry) {
        // Small delay so map is ready
        setTimeout(() => this.showDetail(entry), 400)
      }
    }
  }

  private updateURLState() {
    if (!this.map) return
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

    // Don't add to history on every pan — use replaceState
    window.history.replaceState({}, '', url.toString())
  }

  private currentSheet: BottomSheet | null = null

  private showDetail(entry: KnowledgeEntry) {
    console.log('[MapView] showDetail called for', entry.id, entry.name)

    // Close any existing sheet first
    if (this.currentSheet) {
      this.currentSheet.close()
      this.currentSheet = null
    }

    // Fly/center the map on the selected item (very important for testing)
    if (this.map && typeof entry.location.lat === 'number' && typeof entry.location.lng === 'number') {
      this.map.flyTo({
        center: [entry.location.lng, entry.location.lat],
        zoom: Math.max(this.map.getZoom() || 8, 13),
        duration: 650,
        essential: true
      });
    } else {
      console.warn('[MapView] Entry has no valid lat/lng:', entry.id, entry.name);
    }

    const sheet = new BottomSheet({
      title: entry.name,
      snap: 'half',
      snapPoints: [0.22, 0.56, 0.94],
      dismissible: true,
      showHandle: true,
      onClose: () => {
        this.currentSheet = null
        this.setSelectedEntryInURL(null)
      }
    })

    const isDesktop = window.innerWidth >= 1024;

    if (isDesktop) {
      // Desktop: use a proper centered modal instead of full-width bottom sheet
      this.showDesktopDetailModal(entry);
      return;
    }

    // Mobile / tablet: BottomSheet — photo-first layout
    const content = document.createElement('div')
    content.className = 'space-y-4 text-[#0a0a0a] dark:text-white'

    const heroPhoto = entry.photos && entry.photos.length > 0 ? entry.photos[0] : null

    content.innerHTML = `
      <!-- Photo-first (hero or graceful sourcing state) -->
      ${heroPhoto ? `
      <div class="-mx-4 -mt-4 mb-2">
        <img src="${this.normalizePhotoUrl(heroPhoto.url, this.slug)}" alt="${heroPhoto.caption}" class="w-full h-44 object-cover" />
        <div class="px-4 py-1.5 text-xs text-[#3f3b33] dark:text-[#d4cebf] bg-[#f8f7f4] dark:bg-[#1a1916]">${heroPhoto.caption}</div>
      </div>` : `
      <div class="border border-dashed border-[#d4cebf] dark:border-[#3f3b33] rounded-lg p-4 bg-[#f8f7f4] dark:bg-[#1a1916] mb-2">
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#1f1d1a] dark:text-[#d4cebf] mb-1">Photos sourcing in progress</div>
        <div class="text-sm text-[#6b6761] dark:text-[#a39a8c]">High-quality product photos are being sourced for this profile.</div>
      </div>`}

      <div class="text-[15px] font-semibold text-[#0a0a0a] dark:text-white leading-snug">
        ${entry.location.address}<br>
        ${entry.location.city}${entry.location.region ? ', ' + entry.location.region : ''}, ${entry.location.country}
      </div>

      <div class="text-[15px] leading-relaxed text-[#111] dark:text-[#f4f1e9]">
        ${entry.description}
      </div>

      ${entry.photos && entry.photos.length > 1 ? `
      <div>
        <div class="text-xs uppercase tracking-[1px] text-[#1f1d1a] dark:text-[#d4cebf] font-bold mb-2">More photos</div>
        <div class="flex gap-2 overflow-x-auto pb-1">
          ${entry.photos.slice(1).map((p: any) => `
            <div class="flex-shrink-0 w-32 border border-[#e5e2d9] dark:border-[#3f3b33] rounded overflow-hidden">
              <img src="${this.normalizePhotoUrl(p.url, this.slug)}" alt="${p.caption}" class="w-32 h-20 object-cover" />
            </div>
          `).join('')}
        </div>
      </div>
      ` : ''}

      <div>
        <div class="text-xs uppercase tracking-[1px] text-[#1f1d1a] dark:text-[#d4cebf] font-bold mb-2">Evidence</div>
        <div class="space-y-3">
          ${entry.evidence.map(ev => `
            <div class="border-l-[3px] border-[#1f1d1a] dark:border-[#a39a8c] pl-3">
              <div class="font-semibold text-[#0a0a0a] dark:text-white">${ev.source}</div>
              ${ev.detail ? `<div class="text-sm text-[#1a1a1a] dark:text-[#e8e4d9] mt-0.5">${ev.detail}</div>` : ''}
              ${ev.date ? `<div class="text-xs text-[#3a3a3a] dark:text-[#a39a8c] mt-0.5">${ev.date}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <div class="inline-flex items-center text-sm px-3 py-1 rounded-full bg-[#f1efea] dark:bg-[#2a2924] text-[#1f1d1a] dark:text-[#d4cebf] font-medium">
        Confidence: <span class="font-bold ml-1">${entry.confidence}</span>
      </div>
    `

    sheet.setContent(content)
    sheet.open('half')

    this.currentSheet = sheet

    // Persist selected entry
    this.setSelectedEntryInURL(entry.id)
  }

  private desktopDetailPanel: HTMLDivElement | null = null

  private showDesktopDetailModal(entry: KnowledgeEntry) {
    // Close any existing desktop panel
    if (this.desktopDetailPanel) {
      this.desktopDetailPanel.remove()
      this.desktopDetailPanel = null
    }

    // Close mobile sheet if somehow open
    if (this.currentSheet) {
      this.currentSheet.close()
      this.currentSheet = null
    }

    const desktop = window.innerWidth >= 1024

    // Fly the map
    if (this.map && entry.location.lat && entry.location.lng) {
      if (desktop) {
        // On desktop, give bottom padding so the bottom panel doesn't hide markers
        this.map.easeTo({
          center: [entry.location.lng, entry.location.lat],
          zoom: Math.max(this.map.getZoom() || 8, 13),
          duration: 650,
          padding: { bottom: 320 }
        })
      } else {
        this.map.flyTo({
          center: [entry.location.lng, entry.location.lat],
          zoom: Math.max(this.map.getZoom() || 8, 13),
          duration: 650,
          essential: true
        })
      }
    }

    if (!desktop) {
      // Fall back to mobile BottomSheet on smaller screens
      this.showMobileBottomSheet(entry)
      return
    }

    // Desktop: Bottom panel (Google Maps style) — keeps most of the map visible
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
        <!-- Photo-first layout -->
        ${entry.photos && entry.photos.length > 0 ? `
        <div>
          <div class="text-xs uppercase tracking-[1px] font-bold text-[#1f1d1a] dark:text-[#d4cebf] mb-2">Photos</div>
          <div class="flex gap-3 overflow-x-auto pb-2">
            ${entry.photos.map((p: any) => {
              const src = this.normalizePhotoUrl(p.url, this.slug)
              return `
              <div class="flex-shrink-0 w-72 border border-[#e5e2d9] dark:border-[#3f3b33] rounded-lg overflow-hidden">
                <img src="${src}" alt="${p.caption}" class="w-72 h-48 object-cover" onerror="this.style.display='none';this.insertAdjacentHTML('afterend','<div class=\\'p-3 text-xs text-[#6b6761] dark:text-[#a39a8c]\\'>Photo unavailable</div>')" />
                <div class="p-3 text-sm text-[#3f3b33] dark:text-[#d4cebf]">${p.caption}</div>
              </div>`
            }).join('')}
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

      // Reset map padding when closing
      if (this.map) {
        this.map.easeTo({ padding: { bottom: 0 }, duration: 300 })
      }
    }

    closeBtn.addEventListener('click', close)

    // Close on Escape
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        close()
        document.removeEventListener('keydown', escHandler)
      }
    }
    document.addEventListener('keydown', escHandler, { once: true })

    document.body.appendChild(panel)
    this.desktopDetailPanel = panel

    this.setSelectedEntryInURL(entry.id)
  }

  // Helper for mobile BottomSheet path (kept separate for clarity)
  private showMobileBottomSheet(entry: KnowledgeEntry) {
    const sheet = new BottomSheet({
      title: entry.name,
      snap: 'half',
      snapPoints: [0.22, 0.56, 0.94],
      dismissible: true,
      showHandle: true,
      onClose: () => {
        this.currentSheet = null
        this.setSelectedEntryInURL(null)
      }
    })

    const content = document.createElement('div')
    content.className = 'space-y-4 text-[#0a0a0a] dark:text-white'

    // Hero photo (if available) — shows nicely even when sheet is in peek state
    const heroPhoto = entry.photos && entry.photos.length > 0 ? entry.photos[0] : null

    content.innerHTML = `
      <!-- Photo-first for mobile peek state -->
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
          ${entry.photos.slice(1).map((p: any) => `
            <div class="flex-shrink-0 w-40 border border-[#e5e2d9] rounded overflow-hidden">
              <img src="${this.normalizePhotoUrl(p.url, this.slug)}" class="w-40 h-24 object-cover" onerror="this.style.display='none'" />
              <div class="p-2 text-xs">${p.caption}</div>
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
    // Start small (peek state) like Google Maps mobile — user can drag up for more details
    sheet.open('peek')
    this.currentSheet = sheet
    this.setSelectedEntryInURL(entry.id)
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

  // Normalize photo URLs so they resolve correctly regardless of relative path in JSON
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
      listContainer.innerHTML = filtered.map(e => `
        <div class="py-3.5 entry cursor-pointer active:bg-[#f1efea] dark:active:bg-[#2a2924] border-b border-[#e5e2d9] last:border-b-0" data-id="${e.id}">
          <div class="font-semibold text-[#0f0e0c]">${e.name}</div>
          <div class="text-xs text-[#3f3b33] mt-0.5">${e.location.city}, ${e.location.country}</div>
        </div>
      `).join('')

      listContainer.querySelectorAll('.entry').forEach(el => {
        el.addEventListener('click', () => {
          const id = (el as HTMLElement).dataset.id!
          const entry = this.entries.find(x => x.id === id)!
          sheet.close()
          this.showDetail(entry)
        })
      })
    }

    renderMobileList(this.entries)

    // Live search inside the sheet
    const mobileSearch = content.querySelector('#mobile-search') as HTMLInputElement
    mobileSearch.addEventListener('input', () => {
      const q = mobileSearch.value.toLowerCase().trim()
      const filtered = this.entries.filter(e =>
        e.name.toLowerCase().includes(q) ||
        e.location.city.toLowerCase().includes(q)
      )
      renderMobileList(filtered)
    })

    sheet.setContent(content)
    sheet.open('full')
  }

  unmount() {
    if (this.map) {
      this.map.remove()
      this.map = null
    }
    void this._container // referenced for future cleanup
  }
}
