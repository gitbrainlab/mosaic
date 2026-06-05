import { loadEnrichmentBacklog, loadIndex, loadResearchBatchIndex } from '../lib/data-loader'

type StatusTone = 'done' | 'current' | 'next' | 'later'

interface RoadmapMetric {
  label: string
  value: string
  detail: string
}

interface RoadmapCard {
  title: string
  status: string
  tone: StatusTone
  body: string
}

interface RoadmapStep {
  title: string
  status: string
  tone: StatusTone
  body: string
  signals: string[]
}

export default class RoadmapView {
  async mount(container: HTMLElement) {
    container.innerHTML = `
      <div class="roadmap-shell mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <div class="animate-pulse text-sm text-[#a1a1aa]">Loading roadmap...</div>
      </div>
    `

    const [indexResult, batchIndexResult, backlogResult] = await Promise.all([
      loadIndex(),
      loadResearchBatchIndex(),
      loadEnrichmentBacklog(),
    ])

    const maps = indexResult.data?.maps || []
    const totalEntries = maps.reduce((sum, map) => sum + (map.entryCount || 0), 0)
    const batches = batchIndexResult.data?.batches || []
    const totalProfiles = batches.reduce((sum, batch) => sum + (batch.totalProfiles || 0), 0)
    const profilesWithPhotos = batches.reduce((sum, batch) => sum + (batch.profilesWithPhotos || 0), 0)
    const flaggedEntries = backlogResult.data?.totalFlaggedEntries

    const metrics: RoadmapMetric[] = [
      {
        label: 'Committed maps',
        value: maps.length > 0 ? String(maps.length) : 'Pending',
        detail: maps.length > 0
          ? `${totalEntries} public entries load from static JSON.`
          : this.errorDetail(indexResult.error, 'Static map index did not load in this environment.'),
      },
      {
        label: 'Review batches',
        value: batches.length > 0 ? String(batches.length) : '0',
        detail: batches.length > 0
          ? `${profilesWithPhotos}/${totalProfiles} review profiles currently include photos.`
          : this.errorDetail(batchIndexResult.error, 'No committed review batches are listed yet.'),
      },
      {
        label: 'Quality queue',
        value: typeof flaggedEntries === 'number' ? String(flaggedEntries) : 'Queued',
        detail: typeof flaggedEntries === 'number'
          ? `Flagged entries are available for Studio review.`
          : this.errorDetail(backlogResult.error, 'Backlog index is not available yet.'),
      },
      {
        label: 'Latest atlas update',
        value: this.formatDate(indexResult.data?.lastUpdated),
        detail: 'Public data changes only after validation and committed artifacts.',
      },
    ]

    container.innerHTML = this.render(metrics)
  }

  private render(metrics: RoadmapMetric[]) {
    const currentState: RoadmapCard[] = [
      {
        title: 'Static public atlas',
        status: 'Live',
        tone: 'done',
        body: 'The browser app reads committed files from public/data and renders the gallery, maps, details, search, and filters without a runtime backend.',
      },
      {
        title: 'Hunt gateway',
        status: 'Provisional',
        tone: 'current',
        body: 'Users can start a Hunt from Explore. Netlify can queue drafts, but those drafts stay provisional until GitHub review and validation promote them.',
      },
      {
        title: 'Curation Studio',
        status: 'Active',
        tone: 'current',
        body: 'Studio now has visible queues, preview context, deterministic review payloads, and enrichment controls for curator work.',
      },
      {
        title: 'Research agents',
        status: 'Hardening',
        tone: 'next',
        body: 'GitHub Actions agents can produce structured evidence, rejected candidates, photo briefs, and review batches. Real photo acquisition remains the biggest quality frontier.',
      },
    ]

    const advisoryPriorities: RoadmapCard[] = [
      {
        title: 'Keep the map first',
        status: 'Panel priority',
        tone: 'current',
        body: 'First load should land on useful data, detail surfaces should not bury the map, and next nearby actions should keep exploration moving.',
      },
      {
        title: 'Make visual proof credible',
        status: 'Panel priority',
        tone: 'current',
        body: 'Photo states must be topic-aware. Food maps need real product photos; non-food maps need visual documentation language that feels intentional.',
      },
      {
        title: 'Turn Studio into a workbench',
        status: 'Panel priority',
        tone: 'next',
        body: 'Curators need scannable queues, photo/profile review context, and actions that serialize cleanly for GitHub-native follow-up.',
      },
      {
        title: 'Reduce dead ends',
        status: 'Panel priority',
        tone: 'next',
        body: 'Search and filters need explicit empty states, clear recovery, readable dark mobile sheets, and reliable touch targets.',
      },
    ]

    const roadmap: RoadmapStep[] = [
      {
        title: 'Visual trust and photo proof',
        status: 'Current focus',
        tone: 'current',
        body: 'Upgrade no-photo states, map-specific visual language, photo sourcing queues, and review payloads so missing imagery feels like active curation rather than broken content.',
        signals: [
          'Non-product maps never say "product photos".',
          'Photo briefs stay in review artifacts until real images are verified.',
          'Studio exposes photo issue and photo refinement paths.',
        ],
      },
      {
        title: 'Map-first discovery',
        status: 'Next',
        tone: 'next',
        body: 'Make route load, list search, detail selection, and next nearby browsing feel like one continuous map experience.',
        signals: [
          'Opening a map shows visible markers in the unobscured viewport.',
          'Search never collapses into a blank list without a recovery action.',
          'Detail views offer next or nearby movement without closing context.',
        ],
      },
      {
        title: 'Studio review loop',
        status: 'Next',
        tone: 'next',
        body: 'Evolve Studio from a dashboard into the main review surface for verification, photo review, refinement requests, and batch promotion.',
        signals: [
          'Queues remain scannable on mobile and desktop.',
          'Actions include batchId, entryId, reason, target state, and mode.',
          'Batch decisions feed the next research or promotion pass.',
        ],
      },
      {
        title: 'Research agent hardening',
        status: 'Later',
        tone: 'later',
        body: 'Improve source verification, scraper-backed freshness checks, photo acquisition, rejected-candidate memory, and prompt assimilation across repeat runs.',
        signals: [
          'Rejected candidates preserve source-specific next actions.',
          'Coordinate bounds are declared per localized map.',
          'Photo and evidence quality gates block public promotion.',
        ],
      },
      {
        title: 'v4 release polish',
        status: 'Later',
        tone: 'later',
        body: 'Lock the v4 brand pass, regression screenshots, GitHub Pages artifact shape, and public handoff once the highest-risk interaction and data-quality gaps are closed.',
        signals: [
          'npm test and design regression pass before push.',
          'Gold remains reserved for primary actions and current states.',
          'Public deployment keeps the static-only contract intact.',
        ],
      },
    ]

    return `
      <div class="roadmap-shell mx-auto px-4 sm:px-6 py-5 sm:py-6">
        <header class="roadmap-header">
          <div>
            <div class="uppercase text-[10px] tracking-[1.5px] font-bold text-[#a1a1aa]">ROADMAP</div>
            <h1 class="text-3xl sm:text-4xl font-semibold tracking-tight text-[#e4e4e7]">Where Mosaic sits</h1>
            <p class="mt-2 max-w-3xl text-sm sm:text-base leading-relaxed text-[#a1a1aa]">
              Mosaic is a static public atlas with a provisional Hunt gateway, an active Studio review surface, and GitHub-native research agents feeding committed map data.
            </p>
          </div>
          <div class="roadmap-actions">
            <a class="studio-primary-link" href="${this.appHref('/')}">Start a Hunt</a>
            <a class="studio-secondary-link" href="${this.appHref('/studio')}">Open Studio</a>
            <a class="studio-secondary-link" href="${this.appHref('/info')}">Technical Info</a>
          </div>
        </header>

        <section class="roadmap-metrics" aria-label="Current project metrics">
          ${metrics.map(metric => this.metricCard(metric)).join('')}
        </section>

        <section class="roadmap-grid roadmap-grid-2">
          <div class="roadmap-panel">
            <div class="roadmap-section-kicker">CURRENT STATE</div>
            <h2 class="roadmap-section-title">What exists now</h2>
            <div class="roadmap-card-list">
              ${currentState.map(card => this.summaryCard(card)).join('')}
            </div>
          </div>

          <div class="roadmap-panel">
            <div class="roadmap-section-kicker">ADVISORY GUIDANCE</div>
            <h2 class="roadmap-section-title">What the design panel is steering</h2>
            <div class="roadmap-card-list">
              ${advisoryPriorities.map(card => this.summaryCard(card)).join('')}
            </div>
          </div>
        </section>

        <section class="roadmap-panel">
          <div class="roadmap-section-kicker">IMPLEMENTATION ORDER</div>
          <div class="roadmap-section-row">
            <h2 class="roadmap-section-title">Roadmap from here</h2>
            <span class="roadmap-status roadmap-status-current">Current focus first</span>
          </div>
          <div class="roadmap-timeline">
            ${roadmap.map((step, index) => this.roadmapStep(step, index + 1)).join('')}
          </div>
        </section>

        <section class="roadmap-grid roadmap-grid-3">
          ${this.commitmentCard('Public contract', [
            'The user-facing app remains static.',
            'All data loading stays in src/lib/data-loader.ts.',
            'Netlify drafts never silently override committed maps.',
          ])}
          ${this.commitmentCard('Promotion gates', [
            'Exact street address and matching coordinates.',
            'Current or recent evidence.',
            'Verified real photos or an explicit review backlog item.',
          ])}
          ${this.commitmentCard('Design guardrails', [
            'Dark-first v4 system stays in force.',
            'Gold marks only primary actions, current state, and selection.',
            'Mobile remains the source of truth for interaction decisions.',
          ])}
        </section>
      </div>
    `
  }

  private metricCard(metric: RoadmapMetric) {
    return `
      <article class="roadmap-stat-card">
        <div class="roadmap-stat-label">${this.escape(metric.label)}</div>
        <div class="roadmap-stat-value">${this.escape(metric.value)}</div>
        <p class="roadmap-stat-detail">${this.escape(metric.detail)}</p>
      </article>
    `
  }

  private summaryCard(card: RoadmapCard) {
    return `
      <article class="roadmap-summary-card">
        <div class="roadmap-card-head">
          <h3>${this.escape(card.title)}</h3>
          ${this.statusPill(card.status, card.tone)}
        </div>
        <p>${this.escape(card.body)}</p>
      </article>
    `
  }

  private roadmapStep(step: RoadmapStep, index: number) {
    return `
      <article class="roadmap-step">
        <div class="roadmap-step-index">${index}</div>
        <div class="roadmap-step-body">
          <div class="roadmap-card-head">
            <h3>${this.escape(step.title)}</h3>
            ${this.statusPill(step.status, step.tone)}
          </div>
          <p>${this.escape(step.body)}</p>
          <ul>
            ${step.signals.map(signal => `<li>${this.escape(signal)}</li>`).join('')}
          </ul>
        </div>
      </article>
    `
  }

  private commitmentCard(title: string, items: string[]) {
    return `
      <article class="roadmap-panel roadmap-commitment">
        <div class="roadmap-section-kicker">${this.escape(title)}</div>
        <ul>
          ${items.map(item => `<li>${this.escape(item)}</li>`).join('')}
        </ul>
      </article>
    `
  }

  private statusPill(label: string, tone: StatusTone) {
    return `<span class="roadmap-status roadmap-status-${tone}">${this.escape(label)}</span>`
  }

  private appHref(path: string) {
    const base = import.meta.env.BASE_URL || '/'
    return `${base}${path.replace(/^\//, '')}`.replace(/\/+/g, '/')
  }

  private errorDetail(error: string | undefined, fallback: string) {
    return error ? `${fallback} Check the committed data artifact.` : fallback
  }

  private formatDate(value: string | undefined) {
    if (!value) return 'Not recorded'
    const date = new Date(value.length <= 10 ? `${value}T00:00:00` : value)
    if (Number.isNaN(date.getTime())) return value
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
  }

  private escape(value: string) {
    return value
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;')
  }
}
