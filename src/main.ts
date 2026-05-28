import './style.css'
import { initRouter, getCurrentRoute, goToGallery, goToMap, goToStudio } from './lib/router'
import { loadIndex } from './lib/data-loader'
import type { DataIndex } from './types'
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
      <header class="sticky top-0 z-50 border-b border-[#e5e2d9] bg-[#f8f7f4]/95 dark:bg-[#1a1916]/95 backdrop-blur">
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
      <nav class="sticky bottom-0 z-50 border-t border-[#e5e2d9] bg-[#f8f7f4] dark:bg-[#1a1916] safe-bottom">
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
    <div class="p-6 max-w-3xl mx-auto">
      <!-- Hero / Hunt launcher -->
      <div class="mb-4"></div>

      <!-- The Hunt Experience (Discovery + Curation Loop demo) -->
      <div id="hunt-panel" class="mb-10">
        <div class="mb-3 px-1">
          <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#3f3b33] dark:text-[#d4cebf]">THE LOOP</div>
          <div class="font-semibold text-xl tracking-tight text-[#111] dark:text-white">Start a Hunt</div>
        </div>

        <div class="mosaic-card p-5 border-2 border-[#3f3b33] dark:border-[#d4cebf]">
          <p class="text-[15px] leading-snug mb-4 text-[#1a1816] dark:text-[#f4f1e9]">Tell the research agents what to hunt. They will open an Issue, run deep LLM research (Grok), validate locations &amp; evidence, and commit fresh structured data to the static maps.</p>

          <div class="flex flex-wrap gap-2 mb-4" id="suggestions">
            <button data-suggestion="Ice Cream in the Capital District" class="sugg text-sm px-4 py-1.5 rounded-full border-2 border-[#1f1d1a] bg-[#1f1d1a] text-white hover:bg-black active:bg-[#0a0a0a] dark:border-[#f4f1e9] dark:bg-[#f4f1e9] dark:text-[#111] dark:hover:bg-white transition-colors">Ice Cream – Capital District</button>
            <button data-suggestion="Mid-century modern furniture makers in New York" class="sugg text-sm px-4 py-1.5 rounded-full border-2 border-[#1f1d1a] bg-white text-[#1f1d1a] hover:bg-[#f1efea] dark:border-[#f4f1e9] dark:bg-[#111] dark:text-[#f4f1e9] dark:hover:bg-[#2a2924] transition-colors">Mid-century furniture makers</button>
            <button data-suggestion="Hidden swimming holes in the Adirondacks" class="sugg text-sm px-4 py-1.5 rounded-full border-2 border-[#1f1d1a] bg-white text-[#1f1d1a] hover:bg-[#f1efea] dark:border-[#f4f1e9] dark:bg-[#111] dark:text-[#f4f1e9] dark:hover:bg-[#2a2924] transition-colors">Adirondack swimming holes</button>
          </div>

          <div class="flex gap-2">
            <input id="hunt-input" type="text" placeholder="What topic should the agents research?" class="flex-1 px-4 py-3 text-sm border-2 border-[#1f1d1a] bg-white text-[#111] rounded-lg focus:outline-none focus:border-[#0a0a0a] dark:bg-[#1a1916] dark:border-[#f4f1e9] dark:text-[#f4f1e9]" value="Ice Cream in the Capital District">
            <button id="launch-hunt" class="px-7 py-3 bg-[#111] hover:bg-black active:bg-[#000] text-white text-sm font-bold rounded-lg border-2 border-[#111] transition-all active:scale-[0.985] dark:bg-white dark:text-[#111] dark:border-white dark:hover:bg-[#f4f1e9]">Launch Hunt</button>
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
            <textarea id="hunt-guidance" rows="3" placeholder="Example: Only soft serve. Must have offered coffee flavors before (not flavorburst). Not gas stations. Must have gluten-free cones available." class="w-full px-3 py-2 text-sm border border-[#a39a8c] rounded-md bg-white dark:bg-[#111] text-[#111] dark:text-[#f4f1e9] focus:outline-none"></textarea>
            <div class="text-[10px] text-[#6b6761] dark:text-[#8a8178] mt-1">This will be included in the GitHub Issue the agents receive.</div>
          </div>

          <div class="text-xs mt-3 px-1 text-[#3f3b33] dark:text-[#d4cebf]">Real agents run via GitHub Issues → LLM (Grok) → commits. This is a vivid simulation of the loop for the demo.</div>
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
    startHuntSimulation(container, topic, guidance, index)
  }

  launchBtn.addEventListener('click', launchHunt)

  // Allow Enter key on main input
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      launchHunt()
    }
  })
}

/**
 * Vivid simulation of the GitHub Agent research workflow.
 * Matches the architecture in the notebook diagram: Issues → Input → parallel Jobs (LLM) → Commit.
 */
function startHuntSimulation(container: HTMLElement, topic: string, guidance: string, index: DataIndex) {
  const panel = document.getElementById('hunt-panel')!
  const fullRequest = guidance ? `${topic}\n\nAdditional guidance:\n${guidance}` : topic

  panel.innerHTML = `
    <div class="mosaic-card overflow-hidden border-[#2c2a27]">
      <div class="px-5 pt-5 pb-4 bg-[#1f1d1a] text-white">
        <div class="uppercase tracking-[2px] text-[10px] text-white/60 mb-1">GITHUB AGENT WORKFLOW</div>
        <div class="font-semibold text-xl tracking-tighter">Hunt: ${topic}</div>
      </div>

      <div class="p-5 space-y-6 bg-white">
        <!-- Step 1: Input -->
        <div>
          <div class="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-[#5c5549] mb-2">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-600"></span>
            STEP 1 — INPUT RECEIVED
          </div>
          <div class="text-sm">GitHub Issue opened with research request. Agents notified.</div>
          <div class="mt-2 text-[11px] font-mono bg-[#f8f7f4] px-3 py-2 rounded text-[#3f3b33] border border-[#e5e2d9] whitespace-pre-wrap">
            #research • "${fullRequest}" • opened just now
          </div>
        </div>

        <!-- Step 2: Agents Dispatched (the parallel jobs from the diagram) -->
        <div>
          <div class="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-[#5c5549] mb-2">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-600"></span>
            STEP 2 — AGENTS DISPATCHED
          </div>
          <div class="grid grid-cols-3 gap-2" id="agent-jobs">
            <div class="agent-job border border-[#d4cebf] rounded p-2 text-xs" data-job="1">
              <div class="font-semibold">Job A — Sources</div>
              <div class="text-[10px] text-[#8a8178]">Scanning local media &amp; archives</div>
            </div>
            <div class="agent-job border border-[#d4cebf] rounded p-2 text-xs" data-job="2">
              <div class="font-semibold">Job B — Locations</div>
              <div class="text-[10px] text-[#8a8178]">Geocoding &amp; validation</div>
            </div>
            <div class="agent-job border border-[#d4cebf] rounded p-2 text-xs" data-job="3">
              <div class="font-semibold">Job C — Evidence</div>
              <div class="text-[10px] text-[#8a8178]">Cross-referencing claims</div>
            </div>
          </div>
        </div>

        <!-- Step 3: LLM Research (the actual Grok calls happening in the real agents) -->
        <div>
          <div class="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-[#5c5549] mb-2">
            <span class="inline-block w-2 h-2 rounded-full bg-amber-600 animate-pulse"></span>
            STEP 3 — DEEP RESEARCH (GROK)
          </div>
          <div id="research-log" class="font-mono text-[11px] bg-[#0f0e0c] text-emerald-400 p-3 rounded h-20 overflow-auto leading-tight"></div>
        </div>

        <!-- Step 4: Commit -->
        <div id="commit-step" class="opacity-40">
          <div class="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-[#5c5549] mb-2">
            <span class="inline-block w-2 h-2 rounded-full bg-emerald-600"></span>
            STEP 4 — COMMIT
          </div>
          <div class="text-sm">Validated data written to <span class="font-mono text-xs">public/data/maps/...</span></div>
        </div>
      </div>

      <div class="border-t p-4 bg-[#f8f7f4] flex items-center justify-between">
        <div id="status-line" class="text-xs text-[#5c5549]">Agents running…</div>
        <button id="view-map-btn" disabled class="px-4 py-2 text-sm font-semibold bg-[#d4cebf] text-[#3f3b33] rounded disabled:opacity-50 transition">Map not ready</button>
      </div>
    </div>
  `

  // Animate the agent jobs lighting up (visual of the parallel boxes in the diagram)
  const jobs = panel.querySelectorAll('.agent-job')
  jobs.forEach((job, i) => {
    setTimeout(() => {
      job.classList.add('!border-[#1f1d1a]', '!bg-[#f8f7f4]')
      ;(job as HTMLElement).innerHTML = (job as HTMLElement).innerHTML.replace('border-[#d4cebf]', 'border-[#1f1d1a]')
    }, 420 * (i + 1))
  })

  // The research log — this is the "LLM thinking" that the real Grok agents do
  const logEl = document.getElementById('research-log')!
  const hasGuidance = !!guidance
  const researchLines = hasGuidance
    ? [
        '→ Parsing detailed user constraints...',
        '→ Applying niche filters (soft serve, flavor history, dietary, exclusions)...',
        '→ Cross-referencing against guidance in the Issue...',
        '→ Filtering out gas stations and non-matching profiles',
        '→ Validating gluten-free options and historical flavors',
        '→ 5 high-confidence entries matching all criteria ready',
      ]
    : [
        '→ Querying local historical societies...',
        '→ Found 14 candidate locations with 3+ mentions',
        '→ Filtering for verifiable addresses only',
        '→ Geocoding with confidence scoring...',
        '→ Cross-checking against primary sources',
        '→ 5 high-confidence entries ready for commit',
      ]

  let lineIndex = 0
  const logInterval = setInterval(() => {
    if (lineIndex < researchLines.length) {
      logEl.textContent += researchLines[lineIndex] + '\n'
      logEl.scrollTop = logEl.scrollHeight
      lineIndex++
    } else {
      clearInterval(logInterval)
      // Complete the workflow
      completeHunt(panel, topic, index, container)
    }
  }, 620)
}

function completeHunt(panel: HTMLElement, _topic: string, _index: DataIndex, _rootContainer: HTMLElement) {
  const status = document.getElementById('status-line')!
  const commit = document.getElementById('commit-step')!
  const btn = document.getElementById('view-map-btn') as HTMLButtonElement

  commit.classList.remove('opacity-40')
  commit.innerHTML = `
    <div class="flex items-center gap-2 text-xs uppercase tracking-widest font-bold text-emerald-700 mb-1">
      <span class="inline-block w-2 h-2 rounded-full bg-emerald-600"></span>
      COMMIT SUCCESSFUL
    </div>
    <div class="text-sm">5 new entries committed by research agent. Map is now live.</div>
  `

  status.textContent = 'Research complete. Data committed.'
  btn.disabled = false
  btn.textContent = 'Open live map →'
  btn.classList.remove('!bg-[#d4cebf]', 'text-[#3f3b33]')
  btn.classList.add('!bg-[#1f1d1a]', '!text-white')

  btn.onclick = () => {
    // For the demo we always deliver the high-quality Ice Cream map
    // (the "result" of the simulated hunt the user just triggered)
    goToMap('ice-cream-capital-district')

    // Bonus: after mount, give a little progressive "new entries appeared" feel
    // by briefly highlighting the list area (visual cue that data just landed)
    setTimeout(() => {
      const list = document.getElementById('entry-list')
      if (list) {
        list.style.transition = 'box-shadow 200ms'
        list.style.boxShadow = '0 0 0 3px rgba(31, 29, 26, 0.15)'
        setTimeout(() => {
          if (list) list.style.boxShadow = 'none'
        }, 1400)
      }
    }, 900)
  }

  // Also allow clicking the whole panel to open the map (nice affordance)
  panel.onclick = (e) => {
    if ((e.target as HTMLElement).id !== 'view-map-btn') {
      btn.click()
    }
  }
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

initRouter((route) => {
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
