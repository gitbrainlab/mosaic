import type { DraftHuntEntry, DraftMap, HuntEvent, HuntSpec } from '../../../src/types/hunt';
import { chatComplete, extractJsonObject, hasXaiKey, modelFor } from './xai-client';

interface RefineInput {
  topic: string;
  guidance?: string;
}

function now() {
  return new Date().toISOString();
}

export function slugify(text: string): string {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 72) || 'hunt';
}

export function createId(prefix: string, text: string): string {
  return `${prefix}-${slugify(text)}-${Date.now().toString(36)}`;
}

function asStringArray(value: unknown, fallback: string[] = []): string[] {
  if (!Array.isArray(value)) return fallback;
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim());
}

function fallbackSpec(input: RefineInput): HuntSpec {
  const timestamp = now();
  const title = input.topic.trim() || 'Untitled Hunt';
  return {
    id: createId('hunt', title),
    title,
    topic: title,
    intent: `Find a high-quality starter map for ${title}.`,
    scope: input.guidance || 'User-defined exploratory scope.',
    geography: {
      label: inferGeographyLabel(`${input.topic} ${input.guidance || ''}`),
    },
    mustHaveConstraints: input.guidance ? [input.guidance] : ['Prefer real places with address-level evidence.'],
    exclusions: ['Generic filler', 'weakly evidenced candidates'],
    photoPolicy: 'Use pending photo status in drafts; require real location-tied product photos before public promotion when map policy demands it.',
    desiredScale: {
      initialEntries: 6,
      targetEntries: 25,
    },
    qualityTargets: [
      'exact street addresses',
      'address-level coordinates',
      'recent evidence',
      'source-backed photos or photo sourcing tasks',
    ],
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}

function inferGeographyLabel(text: string): string {
  const lower = text.toLowerCase();
  if (lower.includes('capital district') || lower.includes('albany')) return 'Capital District, New York';
  if (lower.includes('berkshire')) return 'Berkshires / western Massachusetts';
  if (lower.includes('new york')) return 'New York';
  if (lower.includes('northeast')) return 'Northeastern United States';
  return 'User-specified geography';
}

function normalizeSpec(raw: Record<string, unknown>, input: RefineInput): HuntSpec {
  const fallback = fallbackSpec(input);
  const timestamp = now();
  const desiredScale = raw.desiredScale && typeof raw.desiredScale === 'object'
    ? raw.desiredScale as Record<string, unknown>
    : {};
  const geography = raw.geography && typeof raw.geography === 'object'
    ? raw.geography as Record<string, unknown>
    : {};

  return {
    ...fallback,
    title: typeof raw.title === 'string' && raw.title.trim() ? raw.title.trim() : fallback.title,
    topic: typeof raw.topic === 'string' && raw.topic.trim() ? raw.topic.trim() : fallback.topic,
    intent: typeof raw.intent === 'string' && raw.intent.trim() ? raw.intent.trim() : fallback.intent,
    scope: typeof raw.scope === 'string' && raw.scope.trim() ? raw.scope.trim() : fallback.scope,
    geography: {
      label: typeof geography.label === 'string' && geography.label.trim() ? geography.label.trim() : fallback.geography.label,
    },
    mustHaveConstraints: asStringArray(raw.mustHaveConstraints, fallback.mustHaveConstraints),
    exclusions: asStringArray(raw.exclusions, fallback.exclusions),
    photoPolicy: typeof raw.photoPolicy === 'string' && raw.photoPolicy.trim() ? raw.photoPolicy.trim() : fallback.photoPolicy,
    desiredScale: {
      initialEntries: Math.min(Math.max(Number(desiredScale.initialEntries || fallback.desiredScale.initialEntries), 3), 10),
      targetEntries: Math.min(Math.max(Number(desiredScale.targetEntries || fallback.desiredScale.targetEntries), 8), 100),
    },
    qualityTargets: asStringArray(raw.qualityTargets, fallback.qualityTargets),
    createdAt: fallback.createdAt,
    updatedAt: timestamp,
  };
}

export async function refineHunt(input: RefineInput): Promise<{ spec: HuntSpec; mode: 'live' | 'fallback' }> {
  if (!input.topic || input.topic.trim().length < 3) {
    throw new Error('topic must be at least 3 characters');
  }

  if (!hasXaiKey() || process.env.MOCK_HUNT_MODE === 'true') {
    return { spec: fallbackSpec(input), mode: 'fallback' };
  }

  const raw = await chatComplete([
    {
      role: 'system',
      content: `You refine Mosaic Hunt requests into strict JSON. Return only a JSON object with keys: title, topic, intent, scope, geography { label }, mustHaveConstraints, exclusions, photoPolicy, desiredScale { initialEntries, targetEntries }, qualityTargets. Keep it domain-agnostic and promotion-safe.`,
    },
    {
      role: 'user',
      content: `Raw topic: ${input.topic}\nAdditional guidance: ${input.guidance || 'None'}`,
    },
  ], {
    model: modelFor('refine'),
    jsonMode: true,
    maxTokens: 1600,
    temperature: 0.2,
    timeoutMs: 30000,
  });

  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  return { spec: normalizeSpec(parsed, input), mode: 'live' };
}

function fallbackEntry(spec: HuntSpec, index: number): DraftHuntEntry {
  const baseLat = spec.geography.label.toLowerCase().includes('berkshire') ? 42.45 : 42.6526;
  const baseLng = spec.geography.label.toLowerCase().includes('berkshire') ? -73.25 : -73.7562;
  const n = index + 1;
  return {
    id: `${slugify(spec.title)}-draft-${n}`,
    name: `${spec.topic} candidate ${n}`,
    location: {
      address: 'Address pending verification',
      city: spec.geography.label,
      country: 'USA',
      lat: Number((baseLat + index * 0.025).toFixed(6)),
      lng: Number((baseLng - index * 0.025).toFixed(6)),
    },
    summary: `Provisional candidate for ${spec.topic}. Requires source verification before public promotion.`,
    confidence: index < 2 ? 'medium' : 'unknown',
    evidenceHints: ['LLM draft candidate', 'Needs independent source verification'],
    tags: ['draft', 'provisional'],
    photoStatus: 'pending',
    provisionalReason: 'Fast draft entry. Not canonical until GitHub validation and review pass.',
  };
}

function normalizeEntry(raw: Record<string, unknown>, spec: HuntSpec, index: number): DraftHuntEntry {
  const fallback = fallbackEntry(spec, index);
  const location = raw.location && typeof raw.location === 'object' ? raw.location as Record<string, unknown> : {};
  const photoStatus = raw.photoStatus === 'verified' || raw.photoStatus === 'needs_sourcing' || raw.photoStatus === 'suppressed'
    ? raw.photoStatus
    : 'pending';
  const confidence = raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low' || raw.confidence === 'unknown'
    ? raw.confidence
    : fallback.confidence;

  return {
    ...fallback,
    id: typeof raw.id === 'string' && raw.id.trim() ? slugify(raw.id) : fallback.id,
    name: typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : fallback.name,
    location: {
      address: typeof location.address === 'string' && location.address.trim() ? location.address.trim() : fallback.location.address,
      city: typeof location.city === 'string' && location.city.trim() ? location.city.trim() : fallback.location.city,
      region: typeof location.region === 'string' && location.region.trim() ? location.region.trim() : undefined,
      country: typeof location.country === 'string' && location.country.trim() ? location.country.trim() : fallback.location.country,
      lat: Number.isFinite(Number(location.lat)) ? Number(location.lat) : fallback.location.lat,
      lng: Number.isFinite(Number(location.lng)) ? Number(location.lng) : fallback.location.lng,
    },
    summary: typeof raw.summary === 'string' && raw.summary.trim() ? raw.summary.trim() : fallback.summary,
    confidence,
    evidenceHints: asStringArray(raw.evidenceHints, fallback.evidenceHints),
    tags: asStringArray(raw.tags, fallback.tags),
    photoStatus,
    provisionalReason: typeof raw.provisionalReason === 'string' && raw.provisionalReason.trim()
      ? raw.provisionalReason.trim()
      : fallback.provisionalReason,
  };
}

function fallbackDraftMap(spec: HuntSpec, iteration = 0): DraftMap {
  const count = Math.max(3, Math.min(spec.desiredScale.initialEntries, 8));
  return {
    id: createId('draft', spec.title),
    huntId: spec.id,
    title: spec.title,
    tagline: `Provisional Hunt draft for ${spec.geography.label}`,
    narrative: `${spec.intent} This is a rapid draft map; entries require GitHub review before public promotion.`,
    generatedAt: now(),
    iteration,
    entries: Array.from({ length: count }, (_, index) => fallbackEntry(spec, index)),
    suppressedCandidates: [],
  };
}

export async function generateDraftMap(spec: HuntSpec, iteration = 0, instruction = '', previousDraft?: DraftMap | null): Promise<{ draftMap: DraftMap; mode: 'live' | 'fallback' }> {
  if (!hasXaiKey() || process.env.MOCK_HUNT_MODE === 'true') {
    return { draftMap: fallbackDraftMap(spec, iteration), mode: 'fallback' };
  }

  const previousNames = previousDraft?.entries.map(entry => entry.name).filter(Boolean) || [];
  const previousNameKeys = new Set(previousNames.map(normalizeNameForComparison));
  const qualityInstruction = iteration > 0
    ? [
      'This is a secondary quality hunt.',
      'Exclude every previous entry name unless the user explicitly asks to repair that exact record.',
      'Find replacement candidates that are currently operating and better supported.',
      'Suppress closed, rebranded, stale, or weakly evidenced places.',
      'Reject candidates whose only evidence is old directory pages, historical posts, or unverifiable social chatter.',
      'Each accepted entry must include a current operating-status signal and at least one concrete public URL in evidenceHints.',
    ].join(' ')
    : [
      'Prioritize quality over coverage.',
      'Suppress closed, stale, rebranded, or weakly evidenced places.',
      'Each accepted entry must include a current operating-status signal and at least one concrete public URL in evidenceHints.',
    ].join(' ');

  const raw = await chatComplete([
    {
      role: 'system',
      content: [
        'You generate rapid Mosaic draft maps.',
        'Return only JSON with keys title, tagline, narrative, entries, suppressedCandidates.',
        'Every entry must be a real named place with an exact street address and plausible coordinates.',
        'Do not use placeholder names such as "candidate 1", "test entry", "draft place", or generic category names.',
        'Do not include places known to be closed, permanently closed, rebranded into another concept, or unsupported by recent evidence.',
        'Current/recent evidence means an official website/menu/profile, active social account, ordering page, public business profile, or review/source lead from 2024 or later.',
        'Evidence hints must include at least one concrete public URL such as an official site, menu, ordering page, social page, business profile, or review page. Do not use vague leads like "official website" without a URL.',
        'For narrow product, flavor, or style topics, every accepted entry must explicitly support the requested product/style in its summary, tags, or evidence hints. A generic restaurant dessert menu is not enough.',
        'If a candidate cannot be supported as a real place, put it in suppressedCandidates with a reason instead of entries.',
        'Entries must be provisional and include name, location { address, city, region, country, lat, lng }, summary, confidence, evidenceHints, tags, photoStatus, provisionalReason.',
        'Evidence hints must name source types or source leads that a curator can verify, include URLs, and must not merely say verification is needed.',
        'It is acceptable to mark photos pending. Do not claim canonical verification.',
        'Return fewer entries if necessary. Never fill the list with weak substitutes.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify({
        spec,
        iteration,
        instruction,
        qualityInstruction,
        excludePreviousEntryNames: previousNames,
      }, null, 2),
    },
  ], {
    model: modelFor(iteration > 0 ? 'iterate' : 'draft'),
    jsonMode: true,
    maxTokens: 4200,
    temperature: iteration > 0 ? 0.15 : 0.3,
    timeoutMs: 55000,
  });

  const parsed = JSON.parse(extractJsonObject(raw)) as Record<string, unknown>;
  const entriesRaw = Array.isArray(parsed.entries) ? parsed.entries : [];
  const fallback = fallbackDraftMap(spec, iteration);
  const entries = entriesRaw
    .slice(0, 10)
    .map((entry, index) => normalizeEntry(entry as Record<string, unknown>, spec, index))
    .filter(entry => !previousNameKeys.has(normalizeNameForComparison(entry.name)))
    .filter(entry => isUsableLiveEntry(entry, spec));

  if (entries.length === 0) {
    throw new Error('Live Hunt draft did not return usable real-place entries. Refine the request or run a deeper batch pass.');
  }

  return {
    draftMap: {
      ...fallback,
      title: typeof parsed.title === 'string' && parsed.title.trim() ? parsed.title.trim() : fallback.title,
      tagline: typeof parsed.tagline === 'string' && parsed.tagline.trim() ? parsed.tagline.trim() : fallback.tagline,
      narrative: typeof parsed.narrative === 'string' && parsed.narrative.trim() ? parsed.narrative.trim() : fallback.narrative,
      entries,
      suppressedCandidates: Array.isArray(parsed.suppressedCandidates)
        ? parsed.suppressedCandidates.slice(0, 12).map((item: unknown) => {
          const candidate = item && typeof item === 'object' ? item as Record<string, unknown> : {};
          return {
            name: typeof candidate.name === 'string' ? candidate.name : 'Unknown candidate',
            reason: typeof candidate.reason === 'string' ? candidate.reason : 'Suppressed pending verification',
          };
        })
        : fallback.suppressedCandidates,
    },
    mode: 'live',
  };
}

function isUsableLiveEntry(entry: DraftHuntEntry, spec: HuntSpec): boolean {
  const name = entry.name.toLowerCase();
  const fallbackNamePrefix = `${spec.topic} candidate`.toLowerCase();
  if (!entry.name.trim() || name.startsWith(fallbackNamePrefix)) return false;
  if (/\b(candidate|placeholder|test entry|draft place)\b/i.test(entry.name)) return false;
  if (!entry.location.address.trim() || entry.location.address === 'Address pending verification') return false;
  if (!Number.isFinite(entry.location.lat) || !Number.isFinite(entry.location.lng)) return false;
  if (!entryMatchesTopic(entry, spec)) return false;
  const evidenceText = [entry.summary, entry.provisionalReason, ...entry.evidenceHints].join(' ').toLowerCase();
  if (/\b(permanently closed|closed years ago|out of business|no longer operating|former location|rebranded)\b/i.test(evidenceText)) return false;
  if (!/(202[4-6]|current|recent|active|official|menu|ordering|business profile|instagram|facebook|website|posted|listed|open|operating)/i.test(evidenceText)) return false;
  const concreteHint = entry.evidenceHints.some(hint =>
    /(official|menu|ordering|business profile|instagram|facebook|website|posted|listed|review|google|yelp|source|social)/i.test(hint) &&
    /https?:\/\/[^\s)]+/i.test(hint) &&
    !/\b(needs?|pending|requires?|verify|verification|llm draft)\b/i.test(hint),
  );
  if (!concreteHint) return false;
  return true;
}

function normalizeNameForComparison(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function entryMatchesTopic(entry: DraftHuntEntry, spec: HuntSpec): boolean {
  const terms = requiredTopicTerms(spec);
  if (terms.length === 0) return true;
  const entryText = [
    entry.name,
    entry.summary,
    entry.provisionalReason,
    ...entry.tags,
    ...entry.evidenceHints,
  ].join(' ').toLowerCase();
  return terms.every(term => entryText.includes(term));
}

function requiredTopicTerms(spec: HuntSpec): string[] {
  const source = spec.topic || spec.title;
  const stopwords = new Set([
    'and', 'the', 'for', 'with', 'near', 'from', 'that', 'this', 'hunt', 'map',
    'maps', 'location', 'locations', 'place', 'places', 'capital', 'district',
    'albany', 'region', 'regional', 'new', 'york', 'usa', 'only', 'current',
    'currently', 'operating', 'independent', 'verified', 'best', 'top',
  ]);
  const terms = source
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(term => term.length > 2 && !stopwords.has(term));
  return Array.from(new Set(terms)).slice(0, 5);
}

export function eventFor(huntId: string, stage: string, message: string, type = 'status'): HuntEvent {
  return {
    id: createId('evt', `${huntId}-${stage}`),
    huntId,
    type,
    stage,
    message,
    severity: 'info',
    createdAt: now(),
  };
}
