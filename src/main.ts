import './style.css'
import { initRouter, getCurrentRoute, goToGallery, goToMap, goToStudio, goToHunt } from './lib/router'
import { loadIndex } from './lib/data-loader'
import { createHunt } from './lib/assistant'
import type { DataIndex } from './types'
import type { HuntSpec } from './types/hunt'
// MapView is loaded dynamically via import() — do not add static import

/**
 * Mosaic — Phase 1a (Mobile-first foundation)
 * Following the delivered PWA research: bottom nav as primary,
 * bottom sheets for detail, persistent state, etc.
 */

const app = document.querySelector<HTMLDivElement>('#app')!

interface View {
  mount(container: HTMLElement, params?: any): void
  unmount?(): void
}

let currentView: View | null = null

function renderShell() {
  const base = import.meta.env.BASE_URL || '/'
  const logoSrc = `${base}logo.svg`.replace(/\/+/g, '/')
  app.innerHTML = `
    <div class="min-h-screen flex flex-col bg-[#0f0f11] text-[#e4e4e7]">
      <!-- Top bar (contextual) -->
      <header id="app-header" class="sticky top-0 z-50 border-b border-[#27272a] bg-[#0f0f11]/95 backdrop-blur">
        <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <button id="logo" class="flex items-center gap-2 text-[#e4e4e7]">
            <img src="${logoSrc}" alt="Mosaic" class="h-7 w-auto">
            <span class="font-semibold tracking-[-0.02em] text-xl">mosaic</span>
          </button>
        </div>
      </header>

      <!-- Main content -->
      <main id="main-content" class="flex-1 max-w-7xl mx-auto w-full"></main>

      <!-- Bottom Navigation (mobile-first foundation per PWA research) -->
      <nav id="bottom-nav" class="sticky bottom-0 z-50 border-t border-[#27272a] bg-[#0f0f11] safe-bottom">
        <div class="max-w-7xl mx-auto grid grid-cols-3 text-sm">
          <button data-nav="gallery" class="nav-btn flex flex-col items-center py-3 active">
            <span class="text-lg text-[#c9a86c]">◈</span>
            <span class="text-[10px] mt-0.5 text-[#e4e4e7]">Explore</span>
          </button>
          <button data-nav="map" class="nav-btn flex flex-col items-center py-3 hover:opacity-100">
            <span class="text-lg text-[#a1a1aa]">◎</span>
            <span class="text-[10px] mt-0.5 text-[#a1a1aa]">Map</span>
          </button>
          <button data-nav="studio" class="nav-btn flex flex-col items-center py-3 opacity-50 hover:opacity-100">
            <span class="text-lg text-[#a1a1aa]">✎</span>
            <span class="text-[10px] mt-0.5 text-[#a1a1aa]">Studio</span>
          </button>
        </div>
      </nav>
    </div>
  `

  // Logo click
  const logo = document.getElementById('logo')
  logo?.addEventListener('click', () => {
    goToGallery()
  })

  // Bottom nav
  document.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => {
      const nav = (btn as HTMLElement).dataset.nav
      if (nav === 'gallery') {
        goToGallery()
      } else if (nav === 'map') {
        const lastMap = localStorage.getItem('mosaic:lastMap') || 'modernist-architecture'
        goToMap(lastMap)
      } else if (nav === 'studio') {
        goToStudio()
      }
    })
  })
}

function mountView(view: View, params?: any) {
  if (currentView?.unmount) currentView.unmount()

  const container = document.getElementById('main-content')!
  container.innerHTML = ''
  view.mount(container, params)
  currentView = view
}

// ===== Views (loaded on demand for now) =====

async function showGallery() {
  const container = document.getElementById('main-content')!
  container.innerHTML = `
    <div class="p-8 text-center">
      <div class="animate-pulse text-[#a1a1aa]">Loading maps...</div>
    </div>
  `

  const result = await loadIndex()

  if (result.state === 'error' || !result.data) {
    container.innerHTML = `<div class="p-8 text-red-600">Failed to load maps: ${result.error}</div>`
    return
  }

  renderGallery(result.data)
}

function renderGallery(index: DataIndex) {
  const container = document.getElementById('main-content')!

  container.innerHTML = `
    <div class="p-4 sm:p-6 max-w-3xl mx-auto overflow-x-hidden">
      <!-- Hero / Hunt launcher -->
      <div class="mb-4"></div>

      <!-- The Hunt Experience (Discovery + Curation Loop) -->
      <div id="hunt-panel" class="mb-10">
        <div class="mb-3 px-1">
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">THE LOOP</div>
          <div class="font-semibold text-xl tracking-tight text-[#e4e4e7]">Start a Hunt</div>
        </div>

        <div class="mosaic-card p-4 sm:p-5 border border-[#27272a] overflow-hidden">
          <p class="text-[15px] leading-snug mb-4 text-[#e4e4e7]">Tell Mosaic what to hunt. The static app queues a Netlify Hunt job; drafts stay provisional until GitHub Actions validation and approval-gated promotion.</p>

          <div class="flex flex-wrap gap-2 mb-4" id="suggestions">
            <button data-suggestion="Ice Cream in the Capital District" class="sugg text-sm px-4 py-1.5 rounded-full border border-[#c9a86c] bg-[#c9a86c] text-[#0f0f11] transition-colors">Ice Cream – Capital District</button>
            <button data-suggestion="Mid-century modern furniture makers in New York" class="sugg text-sm px-4 py-1.5 rounded-full border border-[#27272a] bg-[#17171a] text-[#e4e4e7] hover:bg-[#1f1d1a] transition-colors">Mid-century furniture makers</button>
            <button data-suggestion="Hidden swimming holes in the Adirondacks" class="sugg text-sm px-4 py-1.5 rounded-full border border-[#27272a] bg-[#17171a] text-[#e4e4e7] hover:bg-[#1f1d1a] transition-colors">Adirondack swimming holes</button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input id="hunt-input" type="text" placeholder="What topic should the agents research?" class="min-w-0 w-full px-4 py-3 text-[16px] sm:text-sm border border-[#27272a] bg-[#0f0f11] text-[#e4e4e7] rounded-lg focus:outline-none focus:border-[#c9a86c]" value="Ice Cream in the Capital District">
            <button id="launch-hunt" class="w-full sm:w-auto px-6 sm:px-7 py-3 bg-[#c9a86c] hover:bg-[#d7bc82] active:bg-[#b99755] text-[#0f0f11] text-[16px] sm:text-sm font-bold rounded-lg border border-[#c9a86c] transition-all active:scale-[0.985]">Start Hunt</button>
          </div>

          <!-- Advanced guidance toggle -->
          <div class="mt-2">
            <button id="toggle-guidance" class="text-xs text-[#a1a1aa] hover:text-[#c9a86c] underline decoration-dotted">
              Need more specific results? Add detailed guidance →
            </button>
          </div>

          <!-- Advanced guidance panel (hidden by default) -->
          <div id="guidance-panel" class="hidden mt-3 p-3 border border-[#27272a] rounded-lg bg-[#17171a]">
            <label class="block text-xs font-semibold text-[#a1a1aa] mb-1">
              Additional instructions for the research agents (highly recommended for niche results)
            </label>
            <textarea id="hunt-guidance" rows="3" placeholder="Example: Only soft serve. Must have offered coffee flavors before (not flavorburst). Not gas stations. Must have gluten-free cones available." class="w-full px-3 py-2 text-[16px] sm:text-sm border border-[#27272a] rounded-md bg-[#0f0f11] text-[#e4e4e7] focus:outline-none focus:border-[#c9a86c]"></textarea>
            <div class="text-[10px] text-[#a1a1aa] mt-1">This becomes part of the structured Hunt profile.</div>
          </div>

          <div class="text-xs mt-3 px-1 text-[#a1a1aa]">Draft jobs run through Netlify. Public maps update only after GitHub Actions validation and approval-gated promotion.</div>
        </div>
      </div>

      <!-- Previously hunted maps -->
      <div class="mb-3 px-1">
        <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">LIVE MAPS</div>
        <div class="text-sm text-[#e4e4e7]">Results of past successful hunts (committed data)</div>
      </div>

      <div class="grid gap-3">
        ${index.maps.map(map => `
          <div class="mosaic-card p-5 cursor-pointer hover:border-[#c9a86c] active:bg-[#1f1d1a] transition-colors group border border-[#27272a]" data-slug="${map.slug}">
            <div class="flex justify-between items-start gap-4">
              <div>
                <div class="font-bold text-lg tracking-tight text-[#e4e4e7] group-hover:underline">${map.title}</div>
                <div class="text-[#a1a1aa] mt-0.5 text-sm">${map.tagline}</div>
              </div>
              <div class="text-right shrink-0 text-xs px-3 py-1 rounded-full bg-[#c9a86c] text-[#0f0f11] font-semibold">${map.entryCount} entries</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="mt-10 text-center">
        <div class="text-xs text-[#a1a1aa]">Hunt drafts are provisional Netlify jobs. Canonical maps are committed static JSON after validation.</div>
      </div>
    </div>
  `

  // Wire existing maps
  container.querySelectorAll('[data-slug]').forEach(el => {
    el.addEventListener('click', () => {
      const slug = (el as HTMLElement).dataset.slug!
      goToMap(slug)
    })
  })

  // Suggestion chips
  container.querySelectorAll('.sugg').forEach(btn => {
    btn.addEventListener('click', () => {
      const val = (btn as HTMLElement).dataset.suggestion
      const input = document.getElementById('hunt-input') as HTMLInputElement
      if (input && val) input.value = val
    })
  })

  // Advanced guidance toggle
  const toggleBtn = document.getElementById('toggle-guidance')!
  const guidancePanel = document.getElementById('guidance-panel')!

  toggleBtn.addEventListener('click', () => {
    if (guidancePanel.classList.contains('hidden')) {
      guidancePanel.classList.remove('hidden')
      toggleBtn.textContent = 'Hide detailed guidance'
    } else {
      guidancePanel.classList.add('hidden')
      toggleBtn.textContent = 'Need more specific results? Add detailed guidance →'
    }
  })

  // Launch Hunt (Netlify-managed job queue)
  const launchBtn = document.getElementById('launch-hunt')!
  const input = document.getElementById('hunt-input') as HTMLInputElement
  const guidanceInput = document.getElementById('hunt-guidance') as HTMLTextAreaElement

  const launchHunt = () => {
    const topic = (input.value || 'A new knowledge map').trim()
    const guidance = guidanceInput?.value?.trim() || ''
    void startRealHunt(topic, guidance)
  }

  launchBtn.addEventListener('click', launchHunt)

  // Allow Enter key on main input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      launchHunt()
    }
  })
}

async function startRealHunt(topic: string, guidance: string) {
  const panel = document.getElementById('hunt-panel')!
  const escapedTopic = escapeHtml(topic)
  const spec = buildHuntSpec(topic, guidance)
  const issueUrl = buildIssueUrl(spec, guidance)

  panel.innerHTML = `
    <div class="mosaic-card overflow-hidden border-[#27272a]">
      <div class="px-5 pt-5 pb-4 bg-[#17171a] text-[#e4e4e7]">
        <div class="uppercase tracking-[2px] text-[10px] text-[#a1a1aa] mb-1">NETLIFY QUEUED HUNT</div>
        <div class="font-semibold text-xl tracking-tighter">Hunt: ${escapedTopic}</div>
      </div>
      <div class="p-5 space-y-4 bg-[#17171a]">
        <div>
          <div class="text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa] mb-2">Intent</div>
          <p class="text-sm leading-relaxed text-[#e4e4e7]">${escapeHtml(spec.intent)}</p>
        </div>
        <div class="grid sm:grid-cols-2 gap-3 text-sm">
          ${profileBlock('Geography', spec.geography.label)}
          ${profileBlock('Scale', `${spec.desiredScale.initialEntries} draft / ${spec.desiredScale.targetEntries} target`)}
          ${profileBlock('Must Have', spec.mustHaveConstraints.join('; ') || 'Address-level evidence')}
          ${profileBlock('Exclusions', spec.exclusions.join('; ') || 'Weak filler')}
        </div>
        <div class="text-xs text-[#a1a1aa]">The HuntSpec is saved as provisional Netlify state. Promotion still runs through GitHub Actions quality gates before public data can change.</div>
      </div>
      <div class="border-t border-[#27272a] p-4 bg-[#0f0f11] flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div id="hunt-create-status" class="text-xs text-[#a1a1aa]">Queuing Hunt job...</div>
        <button id="confirm-hunt" disabled class="min-h-11 px-5 inline-flex items-center justify-center rounded bg-[#c9a86c] text-[#0f0f11] text-sm font-bold disabled:opacity-50">Starting...</button>
      </div>
    </div>
  `

  const status = panel.querySelector('#hunt-create-status')
  try {
    const state = await createHunt(spec)
    if (status) status.textContent = 'Hunt queued. Opening the live draft workspace...'
    goToHunt(state.profile.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to start Hunt'
    panel.querySelector('#confirm-hunt')?.remove()
    const footer = panel.querySelector('.border-t')
    if (status) status.innerHTML = `
      <div class="font-semibold text-[#8a2f18] dark:text-[#ffb199]">Hunt service unavailable</div>
      <div class="mt-1">${escapeHtml(message)}</div>
      <div class="mt-2">Manual fallback remains available while Netlify queue setup is being completed.</div>
    `
    footer?.insertAdjacentHTML('beforeend', `
      <a class="min-h-11 px-5 inline-flex items-center justify-center rounded border border-[#27272a] text-[#e4e4e7] text-sm font-bold" href="${escapeHtml(issueUrl)}" target="_blank" rel="noreferrer">Manual GitHub fallback</a>
    `)
  }
}

function profileBlock(label: string, value: string) {
  return `
    <div class="border border-[#27272a] rounded p-3 bg-[#0f0f11]">
      <div class="text-[10px] uppercase tracking-[1px] font-bold text-[#a1a1aa]">${label}</div>
      <div class="mt-1 text-[#e4e4e7]">${escapeHtml(value)}</div>
    </div>
  `
}

function buildHuntSpec(topic: string, guidance: string): HuntSpec {
  const createdAt = new Date().toISOString()
  const targetScale = parseTargetScale(`${topic} ${guidance}`)
  const geography = inferGeography(topic, guidance)

  return {
    id: `hunt-${slugify(topic).slice(0, 56)}-${Date.now()}`,
    title: `Hunt: ${topic}`,
    topic,
    intent: `Create a high-quality Mosaic map for "${topic}" using current, verifiable, place-specific evidence before any public data promotion.`,
    scope: guidance || 'Research the topic broadly enough to produce a useful first review batch while respecting the quality gates.',
    geography,
    mustHaveConstraints: [
      'Exact street-level address for every candidate',
      'Valid coordinates matching that address',
      'Current or recent evidence of relevance',
      'Verified real photos tied to the actual place and map intent',
      ...(guidance ? [`Curator guidance: ${guidance}`] : []),
    ],
    exclusions: [
      'Stock photos, generic storefronts, parking lots, or unrelated visuals',
      'Closed, stale, or weakly evidenced places',
      'Generic chains or filler unless explicitly requested and justified',
    ],
    photoPolicy: 'Use only real, location-tied photos that visibly show the thing the map is about. Keep unresolved photo work in review artifacts, not public entries.json.',
    desiredScale: {
      initialEntries: Math.min(Math.max(Math.ceil(targetScale / 8), 8), 40),
      targetEntries: targetScale,
    },
    qualityTargets: [
      'Research artifacts first; no raw candidate may write directly to public/data/maps',
      'Promotion requires exact address, valid coordinates, recent evidence, and verified real photos',
      'Rejected candidates must keep a rejection reason for review',
    ],
    createdAt,
    updatedAt: createdAt,
  }
}

function buildIssueUrl(spec: HuntSpec, guidance: string) {
  const body = buildIssueBody(spec, guidance)
  const params = new URLSearchParams({
    template: 'hunt.md',
    title: spec.title,
    body,
    labels: 'research,hunt',
  })
  return `https://github.com/gitbrainlab/mosaic/issues/new?${params.toString()}`
}

function buildIssueBody(spec: HuntSpec, guidance: string) {
  return [
    '## Hunt Request',
    '',
    `Topic: ${spec.topic}`,
    `Intent: ${spec.intent}`,
    `Scope: ${spec.scope}`,
    '',
    '## Curator Guidance',
    '',
    guidance || 'None provided.',
    '',
    '## Normalized HuntSpec',
    '',
    '<!-- mosaic-hunt-spec:start -->',
    '```json',
    JSON.stringify(spec, null, 2),
    '```',
    '<!-- mosaic-hunt-spec:end -->',
    '',
    '## Quality Contract',
    '',
    '- Create research artifacts and review batches first.',
    '- Do not publish raw research directly to entries.json.',
    '- Require exact address, valid coordinates, recent evidence, and verified real location-tied photos before promotion.',
  ].join('\n')
}

function inferGeography(topic: string, guidance: string): HuntSpec['geography'] {
  const text = `${topic} ${guidance}`.toLowerCase()
  if (/capital district|albany|troy|schenectady|saratoga/.test(text)) {
    return {
      label: 'Capital District / Albany region',
      coordinateBounds: {
        minLat: 42.35,
        maxLat: 43.25,
        minLng: -74.35,
        maxLng: -73.45,
      },
    }
  }
  return { label: 'Defined by Hunt request' }
}

function parseTargetScale(text: string) {
  const match = text.match(/\b([1-9][0-9]{1,3})\b/)
  if (!match) return 50
  return Math.min(Math.max(Number(match[1]), 10), 1000)
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'hunt'
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

// ===== App Bootstrap =====

renderShell()

function updateBottomNavActive(routeName: string) {
  document.querySelectorAll('[data-nav]').forEach(btn => {
    const nav = (btn as HTMLElement).dataset.nav
    if (nav === routeName) {
      btn.classList.add('!opacity-100', 'font-medium')
    } else {
      btn.classList.remove('!opacity-100', 'font-medium')
    }
  })
}

function updateShellMode(routeName: string) {
  app.classList.toggle('mosaic-route-map', routeName === 'map')
  app.classList.toggle('mosaic-route-studio', routeName === 'studio')
}

initRouter((route) => {
  updateShellMode(route.name)

  if (route.name === 'gallery') {
    showGallery()
    updateBottomNavActive('gallery')
  } else if (route.name === 'map') {
    // Remember last viewed map for the bottom nav "Map" button
    try { localStorage.setItem('mosaic:lastMap', route.slug) } catch {}

    import('./views/MapView').then(({ default: MapViewClass }) => {
      mountView(new MapViewClass(), { slug: route.slug })
    })
    updateBottomNavActive('map')
  } else if (route.name === 'hunt') {
    import('./views/HuntView').then(({ default: HuntViewClass }) => {
      mountView(new HuntViewClass(), { id: route.id })
    })
    updateBottomNavActive('gallery')
  } else if (route.name === 'studio') {
    import('./views/StudioView').then(({ default: StudioViewClass }) => {
      mountView(new StudioViewClass())
    })
    updateBottomNavActive('studio')
  }
})

// Make router available for debugging
;(window as any).mosaicRouter = { getCurrentRoute } 

console.log('%c[Mosaic] v4 shell initialized — dark-first brand system active', 'color:#c9a86c')
