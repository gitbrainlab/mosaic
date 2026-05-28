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
  LoaderResult,
} from '../types';

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

// ============================================
// Utility: Clear cache (useful for curation studio "reset" flows later)
// ============================================

export function clearDataCache() {
  cache.clear();
}
