import './style.css'
import { initRouter, getCurrentRoute, goToGallery, goToHunt, goToMap, goToStudio } from './lib/router'
import { loadIndex } from './lib/data-loader'
import { createHunt, refineHunt } from './lib/assistant'
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
  app.innerHTML = `
    <div class="min-h-screen flex flex-col bg-[#f8f7f4] dark:bg-[#1a1916]">
      <!-- Top bar (contextual) -->
      <header id="app-header" class="sticky top-0 z-50 border-b border-[#e5e2d9] bg-[#f8f7f4]/95 dark:bg-[#1a1916]/95 backdrop-blur">
        <div class="max-w-7xl mx-auto px-4 h-14 flex items-center justify-between">
          <button id="logo" class="font-semibold tracking-tight text-xl text-[#111] dark:text-white flex items-center gap-2">
            <span class="text-xl">◈</span>
            <span>mosaic</span>
          </button>
        </div>
      </header>

      <!-- Main content -->
      <main id="main-content" class="flex-1 max-w-7xl mx-auto w-full"></main>

      <!-- Bottom Navigation (mobile-first foundation per PWA research) -->
      <nav id="bottom-nav" class="sticky bottom-0 z-50 border-t border-[#e5e2d9] bg-[#f8f7f4] dark:bg-[#1a1916] safe-bottom">
        <div class="max-w-7xl mx-auto grid grid-cols-3 text-sm">
          <button data-nav="gallery" class="nav-btn flex flex-col items-center py-3 active">
            <span class="text-lg text-[#111] dark:text-white">◈</span>
            <span class="text-[10px] mt-0.5 text-[#111] dark:text-[#f4f1e9]">Explore</span>
          </button>
          <button data-nav="map" class="nav-btn flex flex-col items-center py-3 hover:opacity-100">
            <span class="text-lg text-[#111] dark:text-white">◎</span>
            <span class="text-[10px] mt-0.5 text-[#3f3b33] dark:text-[#d4cebf]">Map</span>
          </button>
          <button data-nav="studio" class="nav-btn flex flex-col items-center py-3 opacity-50 hover:opacity-100">
            <span class="text-lg text-[#111] dark:text-white">✎</span>
            <span class="text-[10px] mt-0.5 text-[#3f3b33] dark:text-[#d4cebf]">Studio</span>
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
      <div class="animate-pulse text-[#8a8178]">Loading maps...</div>
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
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">THE LOOP</div>
          <div class="font-semibold text-xl tracking-tight text-[#111] dark:text-white">Start a Hunt</div>
        </div>

        <div class="mosaic-card p-4 sm:p-5 border-2 border-[#3f3b33] dark:border-[#d4cebf] overflow-hidden">
          <p class="text-[15px] leading-snug mb-4 text-[#1a1816] dark:text-[#f4f1e9]">Tell Mosaic what to hunt. Netlify brokers the fast LLM draft, then strong candidates can be promoted into the GitHub review and validation path.</p>

          <div class="flex flex-wrap gap-2 mb-4" id="suggestions">
            <button data-suggestion="Ice Cream in the Capital District" class="sugg text-sm px-4 py-1.5 rounded-full border-2 border-[#1f1d1a] bg-[#1f1d1a] text-white hover:bg-black active:bg-[#0a0a0a] dark:border-[#f4f1e9] dark:bg-[#f4f1e9] dark:text-[#111] dark:hover:bg-white transition-colors">Ice Cream – Capital District</button>
            <button data-suggestion="Mid-century modern furniture makers in New York" class="sugg text-sm px-4 py-1.5 rounded-full border-2 border-[#1f1d1a] bg-white text-[#1f1d1a] hover:bg-[#f1efea] dark:border-[#f4f1e9] dark:bg-[#111] dark:text-[#f4f1e9] dark:hover:bg-[#2a2924] transition-colors">Mid-century furniture makers</button>
            <button data-suggestion="Hidden swimming holes in the Adirondacks" class="sugg text-sm px-4 py-1.5 rounded-full border-2 border-[#1f1d1a] bg-white text-[#1f1d1a] hover:bg-[#f1efea] dark:border-[#f4f1e9] dark:bg-[#111] dark:text-[#f4f1e9] dark:hover:bg-[#2a2924] transition-colors">Adirondack swimming holes</button>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_auto] gap-2">
            <input id="hunt-input" type="text" placeholder="What topic should the agents research?" class="min-w-0 w-full px-4 py-3 text-[16px] sm:text-sm border-2 border-[#1f1d1a] bg-white text-[#111] rounded-lg focus:outline-none focus:border-[#0a0a0a] dark:bg-[#1a1916] dark:border-[#f4f1e9] dark:text-[#f4f1e9]" value="Ice Cream in the Capital District">
            <button id="launch-hunt" class="w-full sm:w-auto px-6 sm:px-7 py-3 bg-[#111] hover:bg-black active:bg-[#000] text-white text-[16px] sm:text-sm font-bold rounded-lg border-2 border-[#111] transition-all active:scale-[0.985] dark:bg-white dark:text-[#111] dark:border-white dark:hover:bg-[#f4f1e9]">Launch Hunt</button>
          </div>

          <!-- Advanced guidance toggle -->
          <div class="mt-2">
            <button id="toggle-guidance" class="text-xs text-[#5c5549] dark:text-[#a39a8c] hover:text-[#2c2a27] dark:hover:text-[#d4cebf] underline decoration-dotted">
              Need more specific results? Add detailed guidance →
            </button>
          </div>

          <!-- Advanced guidance panel (hidden by default) -->
          <div id="guidance-panel" class="hidden mt-3 p-3 border border-[#d4cebf] dark:border-[#3f3b33] rounded-lg bg-[#f8f7f4] dark:bg-[#1a1916]">
            <label class="block text-xs font-semibold text-[#3f3b33] dark:text-[#d4cebf] mb-1">
              Additional instructions for the research agents (highly recommended for niche results)
            </label>
            <textarea id="hunt-guidance" rows="3" placeholder="Example: Only soft serve. Must have offered coffee flavors before (not flavorburst). Not gas stations. Must have gluten-free cones available." class="w-full px-3 py-2 text-[16px] sm:text-sm border border-[#a39a8c] rounded-md bg-white dark:bg-[#111] text-[#111] dark:text-[#f4f1e9] focus:outline-none"></textarea>
            <div class="text-[10px] text-[#6b6761] dark:text-[#8a8178] mt-1">This becomes part of the structured Hunt profile.</div>
          </div>

          <div class="text-xs mt-3 px-1 text-[#3f3b33] dark:text-[#d4cebf]">Draft Hunts are provisional. GitHub remains the source of truth for promoted public maps.</div>
        </div>
      </div>

      <!-- Previously hunted maps -->
      <div class="mb-3 px-1">
        <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">LIVE MAPS</div>
        <div class="text-sm text-[#2c2a27] dark:text-[#e8e4d9]">Results of past successful hunts (committed data)</div>
      </div>

      <div class="grid gap-3">
        ${index.maps.map(map => `
          <div class="mosaic-card p-5 cursor-pointer hover:border-[#111] active:bg-[#f8f7f4] dark:hover:border-white dark:active:bg-[#2a2924] transition-colors group border-2 border-[#3f3b33] dark:border-[#d4cebf]" data-slug="${map.slug}">
            <div class="flex justify-between items-start gap-4">
              <div>
                <div class="font-bold text-lg tracking-tight text-[#111] dark:text-white group-hover:underline">${map.title}</div>
                <div class="text-[#2c2a27] dark:text-[#d4cebf] mt-0.5 text-sm">${map.tagline}</div>
              </div>
              <div class="text-right shrink-0 text-xs px-3 py-1 rounded-full bg-[#1f1d1a] text-white font-semibold dark:bg-white dark:text-[#111]">${map.entryCount} entries</div>
            </div>
          </div>
        `).join('')}
      </div>

      <div class="mt-10 text-center">
        <div class="text-xs text-[#3f3b33] dark:text-[#d4cebf]">The real research agents read Issues, call Grok, and push commits. The browser only ever sees static JSON.</div>
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

  // Launch Hunt (now captures guidance too)
  const launchBtn = document.getElementById('launch-hunt')!
  const input = document.getElementById('hunt-input') as HTMLInputElement
  const guidanceInput = document.getElementById('hunt-guidance') as HTMLTextAreaElement

  const launchHunt = () => {
    const topic = (input.value || 'A new knowledge map').trim()
    const guidance = guidanceInput?.value?.trim() || ''
    startRealHunt(topic, guidance)
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

  panel.innerHTML = `
    <div class="mosaic-card overflow-hidden border-[#2c2a27]">
      <div class="px-5 pt-5 pb-4 bg-[#1f1d1a] text-white">
        <div class="uppercase tracking-[2px] text-[10px] text-white/60 mb-1">MOSAIC HUNT GATEWAY</div>
        <div class="font-semibold text-xl tracking-tighter">Hunt: ${escapedTopic}</div>
      </div>
      <div class="p-5 bg-white dark:bg-[#1a1916]">
        <div class="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-[#5c5549] dark:text-[#d4cebf] mb-2">
          <span class="inline-block w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
          REFINING HUNT PROFILE
        </div>
        <div class="text-sm text-[#2c2a27] dark:text-[#e8e4d9]">Calling the Netlify Hunt gateway to normalize scope, constraints, photo policy, and quality targets.</div>
      </div>
    </div>
  `

  try {
    const { spec, mode } = await refineHunt({ topic, guidance })
    renderHuntConfirmation(panel, spec, mode)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unable to reach the Hunt gateway.'
    renderHuntError(panel, topic, guidance, message)
  }
}

function renderHuntConfirmation(panel: HTMLElement, spec: HuntSpec, mode: string) {
  panel.innerHTML = `
    <div class="mosaic-card overflow-hidden border-[#2c2a27]">
      <div class="px-5 pt-5 pb-4 bg-[#1f1d1a] text-white">
        <div class="uppercase tracking-[2px] text-[10px] text-white/60 mb-1">REFINED HUNT PROFILE</div>
        <div class="font-semibold text-xl tracking-tighter">${escapeHtml(spec.title)}</div>
      </div>
      <div class="p-5 space-y-4 bg-white dark:bg-[#1a1916]">
        <div class="text-xs uppercase tracking-[1px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">Intent</div>
        <p class="text-sm leading-relaxed text-[#2c2a27] dark:text-[#e8e4d9]">${escapeHtml(spec.intent)}</p>
        <div class="grid sm:grid-cols-2 gap-3 text-sm">
          ${profileBlock('Geography', spec.geography.label)}
          ${profileBlock('Scale', `${spec.desiredScale.initialEntries} draft / ${spec.desiredScale.targetEntries} target`)}
          ${profileBlock('Must Have', spec.mustHaveConstraints.join('; ') || 'Address-level evidence')}
          ${profileBlock('Exclusions', spec.exclusions.join('; ') || 'Weak filler')}
        </div>
        <div class="text-xs text-[#6b6761] dark:text-[#a39a8c]">Refinement mode: ${escapeHtml(mode)}. The next step creates a public provisional draft in Netlify Blobs.</div>
      </div>
      <div class="border-t p-4 bg-[#f8f7f4] dark:bg-[#141310] flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-between">
        <div id="hunt-create-status" class="text-xs text-[#5c5549] dark:text-[#a39a8c]">Confirm to generate the rapid draft map.</div>
        <button id="confirm-hunt" class="min-h-11 px-5 rounded bg-[#111] text-white dark:bg-white dark:text-[#111] text-sm font-bold">Generate Draft Map</button>
      </div>
    </div>
  `

  panel.querySelector('#confirm-hunt')?.addEventListener('click', () => void createConfirmedHunt(panel, spec))
}

async function createConfirmedHunt(panel: HTMLElement, spec: HuntSpec) {
  const status = panel.querySelector('#hunt-create-status')
  const button = panel.querySelector('#confirm-hunt') as HTMLButtonElement | null
  if (button) button.disabled = true
  if (status) status.textContent = 'Generating draft map through the Netlify Hunt gateway...'

  try {
    const state = await createHunt(spec)
    goToHunt(state.profile.id)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Draft generation failed.'
    if (status) status.textContent = message
    if (button) button.disabled = false
  }
}

function renderHuntError(panel: HTMLElement, topic: string, guidance: string, message: string) {
  const issueUrl = buildIssueUrl(topic, guidance)
  panel.innerHTML = `
    <div class="mosaic-card p-5 border-2 border-[#7f1d1d]">
      <div class="text-sm font-semibold text-red-700 dark:text-red-300">Hunt gateway unavailable</div>
      <p class="mt-2 text-sm text-[#2c2a27] dark:text-[#e8e4d9]">${escapeHtml(message)}</p>
      <a class="inline-flex mt-4 min-h-11 px-4 items-center rounded bg-[#111] text-white dark:bg-white dark:text-[#111] text-sm font-bold" href="${issueUrl}" target="_blank" rel="noreferrer">Open GitHub Hunt Issue</a>
    </div>
  `
}

function profileBlock(label: string, value: string) {
  return `
    <div class="border border-[#e5e2d9] dark:border-[#3f3b33] rounded p-3">
      <div class="text-[10px] uppercase tracking-[1px] font-bold text-[#5f5a52] dark:text-[#d4cebf]">${label}</div>
      <div class="mt-1 text-[#111] dark:text-white">${escapeHtml(value)}</div>
    </div>
  `
}

function buildIssueUrl(topic: string, guidance: string) {
  const body = [
    '## Hunt Request',
    '',
    `Topic: ${topic}`,
    '',
    '## Guidance',
    '',
    guidance || 'None',
  ].join('\n')
  const params = new URLSearchParams({
    title: `Hunt: ${topic}`,
    body,
    labels: 'research',
  })
  return `https://github.com/gitbrainlab/mosaic/issues/new?${params.toString()}`
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

console.log('%c[Mosaic] Phase 1a shell initialized — mobile-first foundations in progress', 'color:#8a8178')
