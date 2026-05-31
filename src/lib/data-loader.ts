/**
 * Mosaic Data Loader
 *
 * Progressive loading contract:
 *   index.json → manifest.json → entries.json (or future chunks)
 *
 * All paths are resolved against import.meta.env.BASE_URL so
 * the loader works correctly on GitHub Pages (/mosaic/) and locally (/).
 */

import type {
  DataIndex,
  MapManifest,
  KnowledgeEntry,
  ResearchBatch,
  LoaderResult,
} from '../types';
import type { DraftMap, HuntProfile, HuntState } from '../types/hunt';

interface ResearchBatchIndex {
  version: number;
  lastUpdated: string;
  batches: Array<{
    id: string;
    name: string;
    topic: string;
    status: string;
    totalProfiles: number;
    profilesWithPhotos: number;
    createdAt: string;
    file: string;
  }>;
}

interface EnrichmentBacklogIndex {
  generatedAt: string;
  totalMaps: number;
  totalFlaggedEntries: number;
  issueTypes: string[];
  backlog: Array<{
    mapSlug: string;
    mapTitle: string;
    entryId: string;
    entryName: string;
    city: string;
    confidence: string;
    priorityScore: number;
    issues: string[];
  }>;
}

// ============================================
// Internal Cache (in-memory for the session)
// ============================================

const cache = new Map<string, unknown>();

function getCacheKey(path: string): string {
  return `${import.meta.env.BASE_URL}:${path}`;
}

// ============================================
// Core Fetch Helper (with loading state semantics)
// ============================================

async function fetchJson<T>(relativePath: string): Promise<T> {
  const base = import.meta.env.BASE_URL || '/';
  const url = `${base}${relativePath}`.replace(/\/+/g, '/'); // clean up double slashes

  const res = await fetch(url, { cache: 'no-store' }); // we control freshness via deploys

  if (!res.ok) {
    throw new Error(`Failed to load ${relativePath}: ${res.status} ${res.statusText}`);
  }

  return res.json() as Promise<T>;
}

const configuredHuntApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const huntApiBase = configuredHuntApiBase || (import.meta.env.DEV ? 'http://localhost:8888/.netlify/functions' : '');

async function fetchHuntApi<T>(path: string): Promise<T> {
  if (!huntApiBase) {
    throw new Error('Mosaic Hunt API is not configured. Set VITE_API_BASE_URL to the Netlify Functions base URL.');
  }

  let res: Response;
  try {
    res = await fetch(`${huntApiBase}/${path}`, { cache: 'no-store' });
  } catch (err) {
    const detail = err instanceof Error ? err.message : 'network request failed';
    throw new Error(`Unable to reach Mosaic Hunt API at ${huntApiBase}. Check VITE_API_BASE_URL and Netlify allowed origins. (${detail})`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const message = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`;
    throw new Error(message);
  }

  return res.json() as Promise<T>;
}

// ============================================
// Public API
// ============================================

export async function loadIndex(): Promise<LoaderResult<DataIndex>> {
  const key = getCacheKey('data/index.json');

  if (cache.has(key)) {
    return {
      data: cache.get(key) as DataIndex,
      state: 'loaded',
    };
  }

  try {
    const data = await fetchJson<DataIndex>('data/index.json');
    cache.set(key, data);
    return { data, state: 'loaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error loading index';
    return { data: null, state: 'error', error: message };
  }
}

export async function loadMapManifest(slug: string): Promise<LoaderResult<MapManifest>> {
  const path = `data/maps/${slug}/manifest.json`;
  const key = getCacheKey(path);

  if (cache.has(key)) {
    return {
      data: cache.get(key) as MapManifest,
      state: 'loaded',
    };
  }

  try {
    const data = await fetchJson<MapManifest>(path);
    cache.set(key, data);
    return { data, state: 'loaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to load manifest for ${slug}`;
    return { data: null, state: 'error', error: message };
  }
}

export async function loadEntries(slug: string): Promise<LoaderResult<KnowledgeEntry[]>> {
  const path = `data/maps/${slug}/entries.json`;
  const key = getCacheKey(path);

  if (cache.has(key)) {
    return {
      data: cache.get(key) as KnowledgeEntry[],
      state: 'loaded',
    };
  }

  try {
    const data = await fetchJson<KnowledgeEntry[]>(path);
    cache.set(key, data);
    return { data, state: 'loaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to load entries for ${slug}`;
    return { data: null, state: 'error', error: message };
  }
}

/**
 * Future-proof hook for chunked loading.
 * Currently just calls loadEntries. Will be extended when manifests declare multiple chunks.
 */
export async function loadAllEntries(slug: string, manifest: MapManifest): Promise<LoaderResult<KnowledgeEntry[]>> {
  // Phase 1: single file
  if (manifest.chunks.length <= 1) {
    return loadEntries(slug);
  }

  // Future: load multiple chunks in parallel and merge
  // For now we just warn and fall back
  console.warn('[data-loader] Multiple chunks declared but not yet implemented. Loading first chunk only.');
  return loadEntries(slug);
}

export async function loadResearchBatchIndex(): Promise<LoaderResult<ResearchBatchIndex>> {
  const key = getCacheKey('data/research-batches/index.json');

  if (cache.has(key)) {
    return {
      data: cache.get(key) as ResearchBatchIndex,
      state: 'loaded',
    };
  }

  try {
    const data = await fetchJson<ResearchBatchIndex>('data/research-batches/index.json');
    cache.set(key, data);
    return { data, state: 'loaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error loading research batches';
    return { data: null, state: 'error', error: message };
  }
}

export async function loadResearchBatch(file: string): Promise<LoaderResult<ResearchBatch>> {
  const path = `data/research-batches/${file}`;
  const key = getCacheKey(path);

  if (cache.has(key)) {
    return {
      data: cache.get(key) as ResearchBatch,
      state: 'loaded',
    };
  }

  try {
    const data = await fetchJson<ResearchBatch>(path);
    cache.set(key, data);
    return { data, state: 'loaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : `Failed to load research batch ${file}`;
    return { data: null, state: 'error', error: message };
  }
}

export async function loadEnrichmentBacklog(): Promise<LoaderResult<EnrichmentBacklogIndex>> {
  const key = getCacheKey('data/enrichment/verification-index.json');

  if (cache.has(key)) {
    return {
      data: cache.get(key) as EnrichmentBacklogIndex,
      state: 'loaded',
    };
  }

  try {
    const data = await fetchJson<EnrichmentBacklogIndex>('data/enrichment/verification-index.json');
    cache.set(key, data);
    return { data, state: 'loaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error loading enrichment backlog';
    return { data: null, state: 'error', error: message };
  }
}

export async function loadHunt(huntId: string): Promise<LoaderResult<HuntState>> {
  try {
    const data = await fetchHuntApi<HuntState>(`hunt-status?id=${encodeURIComponent(huntId)}`);
    return { data, state: 'loaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error loading Hunt';
    return { data: null, state: 'error', error: message };
  }
}

export async function loadPublicHunts(): Promise<LoaderResult<{ hunts: Array<{ profile: HuntProfile; draftMap: DraftMap | null }> }>> {
  try {
    const data = await fetchHuntApi<{ hunts: Array<{ profile: HuntProfile; draftMap: DraftMap | null }> }>('hunt-list');
    return { data, state: 'loaded' };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error loading public Hunts';
    return { data: null, state: 'error', error: message };
  }
}

// ============================================
// Utility: Clear cache (useful for curation studio "reset" flows later)
// ============================================

export function clearDataCache() {
  cache.clear();
}
