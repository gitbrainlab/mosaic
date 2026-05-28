/**
 * Mosaic — Core Data Types (Phase 1a)
 *
 * These types are intentionally generic and domain-agnostic.
 * They must support any cultural/culinary/collecting topic without bias.
 */

// ============================================
// Loading States (used by data-loader and UI)
// ============================================

export type LoadingState = 'idle' | 'loading' | 'loaded' | 'error';

// ============================================
// Evidence
// ============================================

export interface EvidenceItem {
  type: 'menu' | 'review' | 'photo' | 'article' | 'interview' | 'other';
  source: string;
  detail?: string;
  url?: string;
  date?: string; // ISO date string
}

// ============================================
// Core Knowledge Entry (generic + extensible)
// ============================================

export interface KnowledgeEntry {
  id: string;
  name: string;

  // Location (required for map rendering)
  location: {
    address: string;
    city: string;
    region?: string; // state, province, etc.
    country: string;
    lat: number;
    lng: number;
  };

  description: string;

  // Quality & provenance
  confidence: 'high' | 'medium' | 'low';
  evidence: EvidenceItem[];
  tags: string[];

  // Free-form attributes per map (keeps types extensible)
  attributes?: Record<string, string | number | boolean | string[]>;

  // Photos — must be product-focused, not generic storefronts or parking lots
  photos?: Array<{
    url: string;                    // relative path, e.g. /data/maps/xxx/images/filename.jpg
    caption: string;                // Describes the specific product/variant shown
    credit?: string;
    type?: 'product' | 'variant' | 'detail' | 'context';
  }>;

  // Metadata
  added?: string;        // ISO date
  lastVerified?: string; // ISO date
  notes?: string;
}

// ============================================
// Map Manifest (per-map metadata + future chunking)
// ============================================

export interface MapManifest {
  slug: string;
  title: string;
  tagline: string;
  version: string;
  totalEntries: number;
  lastUpdated: string; // ISO date

  // Map defaults
  defaultCenter: [number, number]; // [lat, lng]
  defaultZoom: number;

  // What fields are filterable in the UI
  filterFields: string[];

  // Progressive loading contract (Phase 1 = single file)
  chunks: string[]; // e.g. ["entries.json"]

  // Optional data-quality guardrails for localized maps.
  validation?: {
    coordinateBounds?: {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    };
  };
}

// ============================================
// Map Summary (lightweight, lives in index.json)
// ============================================

export interface MapSummary {
  slug: string;
  title: string;
  tagline: string;
  entryCount: number;
  lastUpdated: string;
  themeColor?: string; // future brand use
}

// ============================================
// Master Index
// ============================================

export interface DataIndex {
  version: number;
  lastUpdated: string;
  maps: MapSummary[];
}

// ============================================
// Loader Result Wrapper (for UI loading states)
// ============================================

export interface LoaderResult<T> {
  data: T | null;
  state: LoadingState;
  error?: string;
}

// Research Batch types (new in 2026-05)
export type {
  ResearchBatch,
  EnrichmentRun,
  BatchStatus,
} from './research-batch';
