export interface PersonaWaveScenario {
  id: string;
  title: string;
  huntTopic: string;
  guidance: string;
  curatorNote: string;
  mapSlug: string;
  detailEntryId: string;
  searchTerm: string;
  rotation: 'portrait' | 'landscape' | 'mixed';
}

const personaLibrary: PersonaWaveScenario[] = [
  {
    id: 'curious-explorer',
    title: 'Curious Explorer',
    huntTopic: 'coffee ice cream in the capital district',
    guidance: 'Only include current shops with exact street addresses, real operating evidence, and real photos. Flag anything that looks closed or stale.',
    curatorNote: 'Verify currency and prefer living businesses with recent proof.',
    mapSlug: 'ice-cream-capital-district',
    detailEntryId: 'chocolate-bar-albany',
    searchTerm: 'Albany',
    rotation: 'portrait',
  },
  {
    id: 'skeptical-curator',
    title: 'Skeptical Curator',
    huntTopic: 'veal parm in the capital district',
    guidance: 'Reject weak sources. Prefer exact addresses, current hours, and clear menu evidence over reputation alone.',
    curatorNote: 'Keep the approval bar high. Verify currency first.',
    mapSlug: 'veal-parm-capital-district',
    detailEntryId: 'carmens-restaurant-rensselaer-vealparm',
    searchTerm: 'Rensselaer',
    rotation: 'landscape',
  },
  {
    id: 'mobile-commuter',
    title: 'Mobile Commuter',
    huntTopic: 'upside down pizza near the Mohawk Valley',
    guidance: 'Optimize for fast phone scanning. Keep only real places with clear address, current evidence, and location-tied photos.',
    curatorNote: 'Check the list, then tap into detail quickly on a phone-sized screen.',
    mapSlug: 'upside-down-pizza',
    detailEntryId: 'big-jays-pizzeria-rome-marcy-ny',
    searchTerm: 'pizza',
    rotation: 'portrait',
  },
  {
    id: 'field-researcher',
    title: 'Field Researcher',
    huntTopic: 'regional folk traditions with current documentation',
    guidance: 'Prefer active, source-backed cultural records over generic description. Include only places or entries that can be confirmed today.',
    curatorNote: 'Validate the evidence trail and note any gaps that need follow-up.',
    mapSlug: 'regional-folk-traditions',
    detailEntryId: 'ft-001',
    searchTerm: 'craft',
    rotation: 'mixed',
  },
  {
    id: 'quality-gatekeeper',
    title: 'Quality Gatekeeper',
    huntTopic: 'gluten free cone ice cream in the capital region',
    guidance: 'Require exact street-level addresses, current operating proof, and real product photos before any public promotion.',
    curatorNote: 'Hold the line on photo and currency quality.',
    mapSlug: 'gluten-free-cone-ice-cream-capital-region',
    detailEntryId: 'saratoga-gelato-saratoga-springs-ny',
    searchTerm: 'Saratoga',
    rotation: 'portrait',
  },
  {
    id: 'weekend-planner',
    title: 'Weekend Planner',
    huntTopic: 'family friendly ice cream stands with gluten free cones',
    guidance: 'Favor current, easy-to-visit places with clear operating status and photos that match the real storefront or serving counter.',
    curatorNote: 'Plan a tripable list, not a noisy archive.',
    mapSlug: 'ice-cream-nationwide-albany-radial',
    detailEntryId: 'kurver-kreme-albany',
    searchTerm: 'ice cream',
    rotation: 'landscape',
  },
  {
    id: 'desktop-power-user',
    title: 'Desktop Power User',
    huntTopic: 'modernist architecture with strong sourcing',
    guidance: 'Prioritize evidence density, stable search, and precise coordinate handling. Do not accept weakly verified entries.',
    curatorNote: 'Use the desktop review surface to validate, then move on quickly.',
    mapSlug: 'modernist-architecture',
    detailEntryId: 'ma-001',
    searchTerm: 'Villa',
    rotation: 'mixed',
  },
  {
    id: 'night-shift-editor',
    title: 'Night Shift Editor',
    huntTopic: 'regional diners with current menu and photo proof',
    guidance: 'Use a strict current-state filter. Exclude stale, closed, or chain-only results unless explicitly requested.',
    curatorNote: 'Treat stale references as provisional at best.',
    mapSlug: 'regional-folk-traditions',
    detailEntryId: 'ft-001',
    searchTerm: 'diner',
    rotation: 'portrait',
  },
];

function hashSeed(seed: string) {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = Math.imul(31, hash) + seed.charCodeAt(i) | 0;
  }
  return Math.abs(hash);
}

function rotate<T>(items: T[], offset: number): T[] {
  if (items.length === 0) return [];
  const normalized = offset % items.length;
  return [...items.slice(normalized), ...items.slice(0, normalized)];
}

export function selectPersonaWave(seed = getPersonaWaveSeed(), count = 4): PersonaWaveScenario[] {
  const rotated = rotate(personaLibrary, hashSeed(seed));
  return rotated.slice(0, Math.min(count, rotated.length));
}

export function getPersonaWaveSeed() {
  return process.env.MOSAIC_PERSONA_WAVE
    || process.env.MOSAIC_PERSONA_SEED
    || process.env.GITHUB_RUN_ID
    || new Date().toISOString().slice(0, 19);
}

export function getPersonaLibrary() {
  return [...personaLibrary];
}
