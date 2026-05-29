export type ReviewProjectKind = 'mobile' | 'tablet' | 'desktop';

export type ReviewStep =
  | {
      kind: 'goto';
      route: string;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'click';
      selector: string;
      note?: string;
      optional?: boolean;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'clickNth';
      selector: string;
      index: number;
      note?: string;
      optional?: boolean;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'fill';
      selector: string;
      value: string;
      note?: string;
      optional?: boolean;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'press';
      key: string;
      note?: string;
      optional?: boolean;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'wait';
      ms: number;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'hardExpectVisible';
      selector: string;
      timeout?: number;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'checkVisible';
      selector: string;
      timeout?: number;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'checkAnyVisible';
      selectors: string[];
      timeout?: number;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'checkCountAtLeast';
      selector: string;
      count: number;
      timeout?: number;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'checkInputValueIncludes';
      selector: string;
      value: string;
      timeout?: number;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'checkURLIncludes';
      value: string;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'screenshot';
      name: string;
      note?: string;
      when?: ReviewProjectKind[];
    }
  | {
      kind: 'snapshot';
      name: string;
      note?: string;
      when?: ReviewProjectKind[];
    };

export interface ReviewJourney {
  id: string;
  title: string;
  persona: 'Casual Explorer' | 'Topic Requester' | 'Curator / Power User';
  priority: 'P0' | 'P1' | 'P2';
  routeHint: string;
  when?: ReviewProjectKind[];
  expectations: string[];
  inspiration: string[];
  panelQuestions: string[];
  steps: ReviewStep[];
}

export interface ReviewPanelExpert {
  id: string;
  title: string;
  lens: string;
  prompt: string;
  feedbackFocus: string[];
}

export const reviewArtifactsRoot = 'tests/agentic-review/artifacts';
export const reviewGuidancePath = 'tests/agentic-review/guidance.md';
export const reviewFeedbackSchemaPath = 'tests/agentic-review/panel-feedback.schema.json';

export const defaultReviewBaseURL = 'http://127.0.0.1:5173/mosaic/v3/';

export const panelChairPrompt = [
  'You are an expert UI/UX designer + senior frontend engineer specializing in premium, timeless, mobile-first static SPAs (GitHub Pages / vanilla JS or lightweight frameworks).',
  'Project: Mosaic — a 100% static, community-curated knowledge map platform. All intelligence lives in GitHub Actions agents; the frontend is purely static and must remain that way.',
  'The experience must feel quietly confident, curatorial, and premium.',
].join('\n');

interface ReviewMapTarget {
  slug: string;
  title: string;
  detailEntryId: string;
  searchTerm: string;
  photoState: 'photo-rich' | 'no-photo' | 'mixed';
}

const reviewMapTargets: ReviewMapTarget[] = [
  {
    slug: 'ice-cream-capital-district',
    title: 'Ice Cream Capital District',
    detailEntryId: 'chocolate-bar-albany',
    searchTerm: 'Albany',
    photoState: 'mixed',
  },
  {
    slug: 'gluten-free-cone-ice-cream-capital-region',
    title: 'Gluten-Free Cone Ice Cream Capital Region',
    detailEntryId: 'saratoga-gelato-saratoga-springs-ny',
    searchTerm: 'Saratoga',
    photoState: 'photo-rich',
  },
  {
    slug: 'upside-down-pizza',
    title: 'Upside Down Pizza',
    detailEntryId: 'big-jays-pizzeria-rome-marcy-ny',
    searchTerm: 'pizza',
    photoState: 'photo-rich',
  },
  {
    slug: 'modernist-architecture',
    title: 'Modernist Architecture',
    detailEntryId: 'ma-001',
    searchTerm: 'Villa',
    photoState: 'no-photo',
  },
  {
    slug: 'regional-folk-traditions',
    title: 'Regional Folk Traditions',
    detailEntryId: 'ft-001',
    searchTerm: 'craft',
    photoState: 'no-photo',
  },
  {
    slug: 'ice-cream-berkshires-western-massachusetts',
    title: 'Ice Cream Berkshires and Western Massachusetts',
    detailEntryId: 'soco-creamery-great-barrington',
    searchTerm: 'Great Barrington',
    photoState: 'no-photo',
  },
  {
    slug: 'ice-cream-northeast-pilot',
    title: 'Ice Cream Northeast Pilot',
    detailEntryId: 'gelato-fiasco-portland',
    searchTerm: 'Portland',
    photoState: 'no-photo',
  },
];

const mapFirstLoadPermutations: ReviewJourney[] = reviewMapTargets
  .filter(target => target.slug !== 'ice-cream-capital-district')
  .map(target => ({
    id: `map-first-load-${target.slug}`,
    title: `Map First Load: ${target.title}`,
    persona: 'Casual Explorer',
    priority: 'P1',
    routeHint: `/mosaic/v3/?/map/${target.slug}`,
    expectations: [
      'Every committed map should load into an oriented, inspectable map state.',
      'The map should show markers without requiring the user to understand the data geography first.',
      'Map-specific density differences should not break the basic explorer flow.',
    ],
    inspiration: [
      'Treat each map as a curated atlas page, not a generic data dump.',
      'Sparse maps should still feel intentional.',
      'National or multi-region maps need stable camera choices and clear next actions.',
    ],
    panelQuestions: [
      `Does ${target.title} feel like a credible public map on first load?`,
      'Is the camera appropriate for the geography and density?',
      'What immediate next action should be exposed for this map type?',
    ],
    steps: [
      { kind: 'goto', route: `?/map/${target.slug}` },
      { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
      { kind: 'hardExpectVisible', selector: '#show-list-header', timeout: 15000 },
      { kind: 'wait', ms: 2400 },
      { kind: 'checkCountAtLeast', selector: '.maplibregl-marker', count: 1, note: 'Markers should render for every public map.' },
      { kind: 'checkVisible', selector: '#entry-list .entry-row', when: ['desktop'], note: 'Desktop map permutations should preserve list scanning.' },
      { kind: 'snapshot', name: '01-map-initial-dom' },
      { kind: 'screenshot', name: '01-map-initial' },
      { kind: 'click', selector: '#show-list-header', when: ['mobile', 'tablet'], note: 'Mobile and tablet should have an obvious list path.' },
      { kind: 'checkVisible', selector: '#mobile-list .entry', when: ['mobile', 'tablet'] },
      { kind: 'screenshot', name: '02-mobile-list-sheet', when: ['mobile', 'tablet'] },
    ],
  }));

const noPhotoDetailPermutations: ReviewJourney[] = reviewMapTargets
  .filter(target => target.photoState === 'no-photo')
  .map(target => ({
    id: `detail-no-photo-${target.slug}`,
    title: `No-Photo Detail: ${target.title}`,
    persona: 'Casual Explorer',
    priority: 'P0',
    routeHint: `/mosaic/v3/?/map/${target.slug}`,
    expectations: [
      'Profiles without real photos should still feel deliberate and premium.',
      'The sourcing state should explain active curation without sounding broken.',
      'The map should remain available while the detail is open.',
    ],
    inspiration: [
      'No-photo states are editorial placeholders, not error states.',
      'Use the absence of images to reinforce quality standards.',
      'A curator should immediately understand what photo work remains.',
    ],
    panelQuestions: [
      `Does ${target.title} handle missing photos gracefully?`,
      'Is the no-photo state strong enough for public release?',
      'What photo brief or map crop would improve this state?',
    ],
    steps: [
      { kind: 'goto', route: `?/map/${target.slug}` },
      { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
      { kind: 'wait', ms: 2200 },
      { kind: 'click', selector: '#show-list-header', when: ['mobile', 'tablet'] },
      { kind: 'hardExpectVisible', selector: '#mobile-list .entry', timeout: 8000, when: ['mobile', 'tablet'] },
      { kind: 'click', selector: '#mobile-list .entry', when: ['mobile', 'tablet'] },
      { kind: 'hardExpectVisible', selector: '#entry-list .entry-row', timeout: 8000, when: ['desktop'] },
      { kind: 'click', selector: '#entry-list .entry-row', when: ['desktop'] },
      { kind: 'wait', ms: 900 },
      { kind: 'checkVisible', selector: 'text=Photos sourcing in progress', note: 'No-photo details should show a deliberate sourcing state.' },
      { kind: 'checkVisible', selector: '#map', note: 'Detail should not destroy map context.' },
      { kind: 'snapshot', name: '01-no-photo-detail-dom' },
      { kind: 'screenshot', name: '01-no-photo-detail' },
    ],
  }));

const photoRichDetailPermutations: ReviewJourney[] = reviewMapTargets
  .filter(target => target.photoState === 'photo-rich')
  .map(target => ({
    id: `detail-photo-rich-${target.slug}`,
    title: `Photo-Rich Detail: ${target.title}`,
    persona: 'Casual Explorer',
    priority: 'P0',
    routeHint: `/mosaic/v3/?/map/${target.slug}`,
    expectations: [
      'Real product photos should become the hero element without hiding the map.',
      'Photo captions should feel specific and trustworthy.',
      'Desktop and mobile should both make visual browsing feel rewarding.',
    ],
    inspiration: [
      'Photos carry the premium promise more than chrome does.',
      'Photo-first detail should invite exploration, not terminate it.',
      'Captions should reinforce product-centered sourcing standards.',
    ],
    panelQuestions: [
      `Are the photos in ${target.title} prominent enough?`,
      'Does the detail layout make the image feel curated rather than attached?',
      'What would make the next item feel one tap away?',
    ],
    steps: [
      { kind: 'goto', route: `?/map/${target.slug}` },
      { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
      { kind: 'wait', ms: 2200 },
      { kind: 'click', selector: '#show-list-header', when: ['mobile', 'tablet'] },
      { kind: 'hardExpectVisible', selector: '#mobile-list .entry', timeout: 8000, when: ['mobile', 'tablet'] },
      { kind: 'click', selector: '#mobile-list .entry', when: ['mobile', 'tablet'] },
      { kind: 'hardExpectVisible', selector: '#entry-list .entry-row', timeout: 8000, when: ['desktop'] },
      { kind: 'click', selector: '#entry-list .entry-row', when: ['desktop'] },
      { kind: 'wait', ms: 900 },
      { kind: 'checkCountAtLeast', selector: 'img', count: 1, note: 'Photo-rich detail should actually render image elements.' },
      { kind: 'checkVisible', selector: '#map', note: 'Photo-rich detail should preserve map context.' },
      { kind: 'snapshot', name: '01-photo-rich-detail-dom' },
      { kind: 'screenshot', name: '01-photo-rich-detail' },
    ],
  }));

const deepLinkPermutations: ReviewJourney[] = reviewMapTargets
  .filter(target => target.photoState !== 'mixed')
  .slice(0, 4)
  .map(target => ({
    id: `deep-link-entry-${target.slug}`,
    title: `Deep Linked Entry: ${target.title}`,
    persona: 'Casual Explorer',
    priority: 'P1',
    routeHint: `/mosaic/v3/?/map/${target.slug}&entry=${target.detailEntryId}`,
    expectations: [
      'Shared links to a specific entry should restore map, selection, and detail context.',
      'The detail surface should open without the user first manipulating the list.',
      'URL state should remain readable and shareable after map movement.',
    ],
    inspiration: [
      'A curator should be able to send one link to one disputed profile.',
      'Deep links should feel like landing on a composed page, not a recovering app state.',
      'Selected entries should still keep the surrounding map legible.',
    ],
    panelQuestions: [
      `Does the deep link to ${target.title} feel stable and intentional?`,
      'Is the selected profile obvious enough?',
      'What should the landing state do differently on mobile versus desktop?',
    ],
    steps: [
      { kind: 'goto', route: `?/map/${target.slug}&entry=${target.detailEntryId}` },
      { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
      { kind: 'wait', ms: 2600 },
      { kind: 'checkURLIncludes', value: `entry=${target.detailEntryId}`, note: 'Entry id should remain in URL state.' },
      {
        kind: 'checkAnyVisible',
        selectors: ['img[alt]', 'text=Photos sourcing in progress', 'text=Photo unavailable'],
        note: 'Deep link should land with a visible detail hero or no-photo state.',
      },
      { kind: 'snapshot', name: '01-deep-link-entry-dom' },
      { kind: 'screenshot', name: '01-deep-link-entry' },
    ],
  }));

const desktopSearchFilterPermutations: ReviewJourney[] = reviewMapTargets.slice(0, 5).map(target => ({
  id: `desktop-search-filter-${target.slug}`,
  title: `Desktop Search and Filter: ${target.title}`,
  persona: 'Curator / Power User',
  priority: 'P1',
  routeHint: `/mosaic/v3/?/map/${target.slug}`,
  when: ['desktop'],
  expectations: [
    'Desktop users should be able to filter and scan without losing map context.',
    'Search and confidence filters should be compact, clear, and visually stable.',
    'Filtered marker/list states should remain coordinated.',
  ],
  inspiration: [
    'Power users need density without clutter.',
    'Filters should feel like a map instrument panel, not a spreadsheet toolbar.',
    'Search results should reduce movement and repeated map repositioning.',
  ],
  panelQuestions: [
    `Does search/filter feel useful for ${target.title}?`,
    'Are active filter states obvious enough?',
    'Does the right-side list still feel too dominant on desktop?',
  ],
  steps: [
    { kind: 'goto', route: `?/map/${target.slug}` },
    { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
    { kind: 'hardExpectVisible', selector: '#search', timeout: 8000 },
    { kind: 'wait', ms: 1800 },
    { kind: 'fill', selector: '#search', value: target.searchTerm, note: `Search for ${target.searchTerm}.` },
    { kind: 'click', selector: '.filter-btn[data-filter="high"]', note: 'Apply high-confidence filter.' },
    { kind: 'wait', ms: 500 },
    { kind: 'checkURLIncludes', value: 'confidence=high', note: 'Filter state should be reflected in URL.' },
    { kind: 'checkVisible', selector: '#entry-list', note: 'Filtered list should remain available.' },
    { kind: 'snapshot', name: '01-desktop-filtered-dom' },
    { kind: 'screenshot', name: '01-desktop-filtered' },
  ],
}));

const mobileListSearchPermutations: ReviewJourney[] = reviewMapTargets.slice(0, 5).map(target => ({
  id: `mobile-list-search-${target.slug}`,
  title: `Mobile List Search: ${target.title}`,
  persona: 'Casual Explorer',
  priority: 'P1',
  routeHint: `/mosaic/v3/?/map/${target.slug}`,
  when: ['mobile', 'tablet'],
  expectations: [
    'Mobile users should be able to search entries from the list sheet quickly.',
    'The list sheet should feel like a temporary aid, not a replacement for the map.',
    'Search should preserve large touch targets and clear hierarchy.',
  ],
  inspiration: [
    'Mobile search should reduce panning and hunting.',
    'Keep the sheet compact enough to preserve spatial memory.',
    'Filtered entries should remain easy to tap.',
  ],
  panelQuestions: [
    `Does mobile list search help exploration for ${target.title}?`,
    'Does the sheet height feel right while searching?',
    'What should happen after tapping a filtered result?',
  ],
  steps: [
    { kind: 'goto', route: `?/map/${target.slug}` },
    { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
    { kind: 'wait', ms: 1800 },
    { kind: 'click', selector: '#show-list-header' },
    { kind: 'hardExpectVisible', selector: '#mobile-search', timeout: 8000 },
    { kind: 'fill', selector: '#mobile-search', value: target.searchTerm },
    { kind: 'wait', ms: 400 },
    { kind: 'checkCountAtLeast', selector: '#mobile-list .entry', count: 1, note: 'Mobile search should return at least one tappable result for the chosen term.' },
    { kind: 'snapshot', name: '01-mobile-search-dom' },
    { kind: 'screenshot', name: '01-mobile-search' },
  ],
}));

export const reviewJourneys: ReviewJourney[] = [
  {
    id: 'gallery-hunt-intake',
    title: 'Gallery to Hunt Intake',
    persona: 'Topic Requester',
    priority: 'P0',
    routeHint: '/mosaic/v3/',
    expectations: [
      'The hunt launcher is immediately legible without repeating Mosaic branding in the content area.',
      'Detailed guidance feels useful for research agents without turning the first screen into an admin form.',
      'Launching a hunt makes the static GitHub-native workflow feel credible and understandable.',
    ],
    inspiration: [
      'Quiet, editorial density: compact but not cramped.',
      'The UI should make a niche request feel welcome and precise.',
      'The browser experience should never imply there is a runtime backend.',
    ],
    panelQuestions: [
      'Is the first screen a strong enough invitation for a casual explorer and a topic requester?',
      'What should be removed, tightened, or renamed before more brand identity is applied?',
      'Does the simulated agent workflow teach the real architecture without feeling gimmicky?',
    ],
    steps: [
      { kind: 'goto', route: '.', note: 'Open the v3 gallery.' },
      { kind: 'hardExpectVisible', selector: 'text=Start a Hunt', timeout: 15000 },
      { kind: 'hardExpectVisible', selector: 'text=LIVE MAPS', timeout: 15000 },
      { kind: 'checkCountAtLeast', selector: '[data-slug]', count: 1, note: 'At least one committed map card should be visible.' },
      { kind: 'snapshot', name: '01-gallery-dom' },
      { kind: 'screenshot', name: '01-gallery' },
      { kind: 'click', selector: '#toggle-guidance', note: 'Expose detailed research guidance.' },
      {
        kind: 'fill',
        selector: '#hunt-guidance',
        value: 'Only include places with exact street-level addresses, current evidence, and product-centered photo briefs. Exclude generic chains and low-confidence filler.',
      },
      { kind: 'checkVisible', selector: '#guidance-panel', note: 'Guidance area should be present and readable.' },
      { kind: 'screenshot', name: '02-guidance-open' },
      { kind: 'click', selector: '#launch-hunt', note: 'Exercise the GitHub Actions research loop simulation.' },
      { kind: 'hardExpectVisible', selector: 'text=GITHUB AGENT WORKFLOW', timeout: 5000 },
      { kind: 'hardExpectVisible', selector: 'text=Research complete. Data committed.', timeout: 9000 },
      { kind: 'checkVisible', selector: '#view-map-btn', note: 'The completed hunt should expose a clear route into the resulting map.' },
      { kind: 'snapshot', name: '03-hunt-complete-dom' },
      { kind: 'screenshot', name: '03-hunt-complete' },
    ],
  },
  {
    id: 'map-first-load',
    title: 'Map First Load',
    persona: 'Casual Explorer',
    priority: 'P0',
    routeHint: '/mosaic/v3/?/map/ice-cream-capital-district',
    expectations: [
      'The map remains the first-class citizen after route load.',
      'Initial camera state should orient to useful data rather than an empty or beige-feeling frame.',
      'List access is discoverable on mobile without colliding with bottom navigation.',
    ],
    inspiration: [
      'A map should feel alive before the user clicks anything.',
      'Navigation should be obvious but restrained.',
      'Use first-load state to reduce the urge to pan, zoom, and hunt blindly.',
    ],
    panelQuestions: [
      'Does the map load state feel confident or does it still feel like a blank technical canvas?',
      'Is the List affordance obvious enough on mobile and tablet?',
      'What is the next most useful one-tap action after this first load?',
    ],
    steps: [
      { kind: 'goto', route: '?/map/ice-cream-capital-district', note: 'Open the primary demo map directly.' },
      { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
      { kind: 'hardExpectVisible', selector: '#show-list-header', timeout: 15000 },
      { kind: 'wait', ms: 2200, note: 'Allow tiles, markers, and camera fit to settle.' },
      { kind: 'checkCountAtLeast', selector: '.maplibregl-marker', count: 1, note: 'Markers are a strong signal that the map is not an empty first-load state.' },
      { kind: 'checkVisible', selector: '#entry-list .entry-row', when: ['desktop'], note: 'Desktop should expose scannable entries beside the map.' },
      { kind: 'snapshot', name: '01-map-initial-dom' },
      { kind: 'screenshot', name: '01-map-initial' },
      { kind: 'click', selector: '#show-list-header', when: ['mobile', 'tablet'], note: 'Open the mobile/tablet list sheet.' },
      { kind: 'checkVisible', selector: '#mobile-list .entry', when: ['mobile', 'tablet'], note: 'List sheet should reveal map entries quickly.' },
      { kind: 'screenshot', name: '02-mobile-list-sheet', when: ['mobile', 'tablet'] },
    ],
  },
  {
    id: 'map-detail-photo-first',
    title: 'Map Detail With Photo-First or No-Photo State',
    persona: 'Casual Explorer',
    priority: 'P0',
    routeHint: '/mosaic/v3/?/map/ice-cream-capital-district',
    expectations: [
      'Opening a detail should not make the map feel abandoned.',
      'A product photo or premium no-photo sourcing state should be the hero element.',
      'The next interesting entry should feel close at hand after a detail is opened.',
    ],
    inspiration: [
      'Mobile sheets should have a light touch in peek state.',
      'Desktop panels should show photos beautifully while preserving map context.',
      'No-photo states should read as active curation, not missing content.',
    ],
    panelQuestions: [
      'Does the detail surface earn the amount of screen it takes?',
      'Is the no-photo state credible enough for a public map?',
      'What controls would reduce the next-click / reposition burden?',
    ],
    steps: [
      { kind: 'goto', route: '?/map/ice-cream-capital-district' },
      { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
      { kind: 'wait', ms: 2200 },
      { kind: 'click', selector: '#show-list-header', when: ['mobile', 'tablet'], note: 'Use list sheet as the mobile entry route.' },
      { kind: 'hardExpectVisible', selector: '#mobile-list .entry', timeout: 8000, when: ['mobile', 'tablet'] },
      { kind: 'click', selector: '#mobile-list .entry', when: ['mobile', 'tablet'] },
      { kind: 'hardExpectVisible', selector: '#entry-list .entry-row', timeout: 8000, when: ['desktop'] },
      { kind: 'click', selector: '#entry-list .entry-row', when: ['desktop'] },
      { kind: 'wait', ms: 900, note: 'Allow camera movement and sheet/panel transition.' },
      {
        kind: 'checkAnyVisible',
        selectors: ['img[alt]', 'text=Photos sourcing in progress', 'text=Photo unavailable'],
        note: 'Detail should lead with either real photos or a deliberate sourcing state.',
      },
      { kind: 'checkVisible', selector: '#map', note: 'Map should still exist behind or above the detail surface.' },
      { kind: 'snapshot', name: '01-detail-open-dom' },
      { kind: 'screenshot', name: '01-detail-open' },
      { kind: 'press', key: 'Escape', optional: true, note: 'Exercise dismiss path when available.' },
      { kind: 'wait', ms: 350 },
      { kind: 'screenshot', name: '02-detail-dismissed' },
    ],
  },
  {
    id: 'studio-batch-review',
    title: 'Studio Batch Review Surface',
    persona: 'Curator / Power User',
    priority: 'P1',
    routeHint: '/mosaic/v3/?/studio',
    expectations: [
      'Studio should feel like the natural continuation of Launch Hunt, not a separate back office.',
      'Batches should expose enough visual and quality context for a curator to give useful feedback.',
      'Verification and refinement queues should be scannable on mobile.',
    ],
    inspiration: [
      'Treat batch review as editorial triage.',
      'Use compact, high-signal summaries before asking curators to inspect details.',
      'Feedback should be structured enough that GitHub-native agents can act on it.',
    ],
    panelQuestions: [
      'What minimum detail does a curator need before deciding to approve, reject, or refine a batch?',
      'Where should visual photo feedback live: per profile, per candidate image, or both?',
      'Does the Studio surface feel public-product-quality or merely operational?',
    ],
    steps: [
      { kind: 'goto', route: '?/studio' },
      { kind: 'hardExpectVisible', selector: 'text=Research Batches', timeout: 15000 },
      { kind: 'checkVisible', selector: 'text=Verification Queue', note: 'If present, the verification queue should be prominent and readable.' },
      { kind: 'checkCountAtLeast', selector: '.mosaic-card', count: 1, note: 'Studio should render at least one review card.' },
      { kind: 'snapshot', name: '01-studio-dom' },
      { kind: 'screenshot', name: '01-studio' },
    ],
  },
  {
    id: 'gallery-map-card-scan',
    title: 'Gallery Map Card Scan',
    persona: 'Casual Explorer',
    priority: 'P1',
    routeHint: '/mosaic/v3/',
    expectations: [
      'The gallery should make committed maps feel discoverable and varied.',
      'Map cards should be dense enough for scanning without feeling like a landing page.',
      'Entry counts and titles should help the user pick a map quickly.',
    ],
    inspiration: [
      'The gallery is a working atlas shelf.',
      'Avoid repeating brand language when map titles can do the work.',
      'The first viewport should hint that more maps exist.',
    ],
    panelQuestions: [
      'Do the cards create enough topical variety?',
      'Is the card density right for mobile?',
      'Which metadata would make choosing a map easier?',
    ],
    steps: [
      { kind: 'goto', route: '.' },
      { kind: 'hardExpectVisible', selector: 'text=LIVE MAPS', timeout: 15000 },
      { kind: 'checkCountAtLeast', selector: '[data-slug]', count: 6, note: 'The public gallery should show a meaningful atlas, not a single demo.' },
      { kind: 'clickNth', selector: '[data-slug]', index: 2, note: 'Open a non-primary map from the gallery.' },
      { kind: 'hardExpectVisible', selector: '#map', timeout: 15000 },
      { kind: 'wait', ms: 1800 },
      { kind: 'snapshot', name: '01-third-card-map-dom' },
      { kind: 'screenshot', name: '01-third-card-map' },
    ],
  },
  {
    id: 'hunt-minimal-enter-key',
    title: 'Minimal Hunt via Enter Key',
    persona: 'Topic Requester',
    priority: 'P1',
    routeHint: '/mosaic/v3/',
    expectations: [
      'A simple topic request should launch without requiring detailed guidance.',
      'Keyboard submission should work for fast topic requesters.',
      'The workflow simulation should remain understandable with minimal input.',
    ],
    inspiration: [
      'The fastest path should still feel precise.',
      'Do not make advanced guidance feel mandatory.',
      'Keyboard flows matter for power users and accessibility.',
    ],
    panelQuestions: [
      'Does the minimal flow feel too thin compared with the guided flow?',
      'Is the Enter-key behavior discoverable enough?',
      'What feedback should appear immediately after launch?',
    ],
    steps: [
      { kind: 'goto', route: '.' },
      { kind: 'hardExpectVisible', selector: '#hunt-input', timeout: 15000 },
      { kind: 'fill', selector: '#hunt-input', value: 'Regional diner pie counters with house-made seasonal pies' },
      { kind: 'press', key: 'Enter', note: 'Submit from the topic field.' },
      { kind: 'hardExpectVisible', selector: 'text=GITHUB AGENT WORKFLOW', timeout: 5000 },
      { kind: 'hardExpectVisible', selector: 'text=Research complete. Data committed.', timeout: 9000 },
      { kind: 'snapshot', name: '01-minimal-hunt-complete-dom' },
      { kind: 'screenshot', name: '01-minimal-hunt-complete' },
    ],
  },
  {
    id: 'hunt-suggestion-chip-permutations',
    title: 'Hunt Suggestion Chip Permutations',
    persona: 'Topic Requester',
    priority: 'P2',
    routeHint: '/mosaic/v3/',
    expectations: [
      'Suggestion chips should be useful accelerators, not generic filler.',
      'Each chip should update the topic field predictably.',
      'Suggested topics should remain domain-agnostic and avoid making Mosaic feel single-topic.',
    ],
    inspiration: [
      'Topic examples should broaden imagination.',
      'The input field should always reflect the exact request the agents will receive.',
      'Suggestion chips are guidance, not marketing decoration.',
    ],
    panelQuestions: [
      'Are the current examples broad enough?',
      'Do the chips accidentally over-index on food?',
      'Should chips be generated from existing maps, agent backlogs, or curated examples?',
    ],
    steps: [
      { kind: 'goto', route: '.' },
      { kind: 'hardExpectVisible', selector: '#hunt-input', timeout: 15000 },
      { kind: 'clickNth', selector: '.sugg', index: 0 },
      { kind: 'checkInputValueIncludes', selector: '#hunt-input', value: 'Ice Cream' },
      { kind: 'clickNth', selector: '.sugg', index: 1 },
      { kind: 'checkInputValueIncludes', selector: '#hunt-input', value: 'furniture' },
      { kind: 'clickNth', selector: '.sugg', index: 2 },
      { kind: 'checkInputValueIncludes', selector: '#hunt-input', value: 'swimming' },
      { kind: 'snapshot', name: '01-suggestions-dom' },
      { kind: 'screenshot', name: '01-suggestions' },
    ],
  },
  ...mapFirstLoadPermutations,
  ...noPhotoDetailPermutations,
  ...photoRichDetailPermutations,
  ...deepLinkPermutations,
  ...desktopSearchFilterPermutations,
  ...mobileListSearchPermutations,
];

export const reviewPanelExperts: ReviewPanelExpert[] = [
  {
    id: 'premium-mobile-ux',
    title: 'Premium Mobile UI/UX Designer',
    lens: 'Mobile-first interaction quality, density, hierarchy, sheet behavior, and emotional confidence.',
    prompt: 'Review Mosaic as a premium mobile-first product. Be direct about anything that feels generic, cramped, heavy, or unclear.',
    feedbackFocus: [
      'Bottom sheet weight and photo-first composition',
      'First-screen hunt clarity',
      'Tap targets and mobile flow continuity',
      'No-photo states as premium editorial placeholders',
    ],
  },
  {
    id: 'senior-static-spa-engineer',
    title: 'Senior Frontend Engineer for Static SPAs',
    lens: 'Implementation feasibility inside a 100% static Vite/TypeScript/GitHub Pages app.',
    prompt: 'Review the UI and recommend implementation guidance that preserves the static architecture and avoids unnecessary dependencies.',
    feedbackFocus: [
      'DOM simplicity and maintainable component boundaries',
      'Data shapes that can be committed as JSON',
      'Performance and first-load behavior',
      'Regression-testable acceptance criteria',
    ],
  },
  {
    id: 'cartographic-discovery',
    title: 'Map Discovery Product Designer',
    lens: 'Map-first exploration, camera behavior, entry sequencing, and quick navigation between interesting places.',
    prompt: 'Review whether the map remains the hero and whether discovery feels spatially coherent from gallery to detail.',
    feedbackFocus: [
      'Map first-load orientation',
      'Marker/list/detail coordination',
      'Next interesting navigation',
      'Avoiding detail surfaces that overpower the map',
    ],
  },
  {
    id: 'curation-workflow',
    title: 'Curation Workflow Strategist',
    lens: 'Batch review, refinement loops, photo feedback, and GitHub-native agent handoff.',
    prompt: 'Review Studio as a curator workflow and propose feedback structures that research agents can act on deterministically.',
    feedbackFocus: [
      'Batch list and detail hierarchy',
      'Photo/profile feedback affordances',
      'Approval/refinement states',
      'GitHub Issue and JSON handoff clarity',
    ],
  },
  {
    id: 'accessibility-visual-quality',
    title: 'Accessibility and Visual Quality Reviewer',
    lens: 'Contrast, text fitting, keyboard paths, dark mode, and layout stability across viewports.',
    prompt: 'Review the screenshots and DOM snapshots for accessibility and visual QA issues that should block production polish.',
    feedbackFocus: [
      'Light/dark contrast',
      'Keyboard escape and focus affordances',
      'Overflow or text collisions',
      'Touch target sizing and responsive stability',
    ],
  },
];
