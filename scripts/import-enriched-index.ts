#!/usr/bin/env tsx
/**
 * Imports a rich niche index (like upside-down-pizza research JSON) into
 * Mosaic map format while preserving source/photo verification fields.
 *
 * Usage:
 *   npx tsx scripts/import-enriched-index.ts /path/to/index.json --slug=upside-down-pizza --title="Upside Down Pizza" --tagline="..."
 */
import fs from 'fs';
import path from 'path';

type RawRecord = {
  id: string;
  name: string;
  location: {
    address?: string;
    city?: string;
    state?: string;
    country?: string;
    lat: number;
    lng: number;
  };
  style_description?: string;
  llm_summary?: string;
  historical_context?: string;
  characteristics?: string[];
  classification?: Record<string, unknown>;
  novelty_score?: number;
  discovered_date?: string;
  sources?: string[];
  reviews?: Array<{ source?: string; quote?: string; url?: string; date?: string }>;
  photo_evidence?: Array<{ url: string; caption?: string; credit?: string; verified?: boolean }>;
};

const BLOCKED_PHOTO_HOST_PATTERNS = [
  'unsplash.com',
  'pexels.com',
  'shutterstock.com',
  'istockphoto.com',
  'adobe.com',
  'gettyimages.com',
];

function isAllowedVerifiedPhoto(url: string, verified: boolean | undefined): boolean {
  if (!verified) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return !BLOCKED_PHOTO_HOST_PATTERNS.some(pattern => host.includes(pattern));
  } catch {
    return false;
  }
}

function parseArg(name: string): string | undefined {
  const key = `--${name}=`;
  return process.argv.find(arg => arg.startsWith(key))?.slice(key.length);
}

const inputPath = process.argv[2];
const slug = parseArg('slug');
const title = parseArg('title');
const tagline = parseArg('tagline') || 'Community-researched map with verified product evidence';

if (!inputPath || !slug || !title) {
  console.error('Usage: npx tsx scripts/import-enriched-index.ts <input.json> --slug=... --title="..." [--tagline="..."]');
  process.exit(1);
}

const raw = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as RawRecord[];
if (!Array.isArray(raw)) {
  console.error('Input must be a JSON array of records.');
  process.exit(1);
}

const mapDir = path.join('public', 'data', 'maps', slug);
fs.mkdirSync(path.join(mapDir, 'images'), { recursive: true });

const entries = raw.map((item, i) => {
  const description = item.style_description || item.llm_summary || `Profile ${i + 1}`;
  const evidence = [
    ...(item.sources || []).map(source => ({ type: 'article', source, url: source })),
    ...(item.reviews || []).map(review => ({
      type: 'review',
      source: review.source || 'review',
      detail: review.quote,
      url: review.url,
      date: review.date,
    })),
  ];

  const confidence = evidence.length >= 3 ? 'high' : evidence.length >= 1 ? 'medium' : 'low';
  const allowedPhotoEvidence = (item.photo_evidence || [])
    .filter(photo => isAllowedVerifiedPhoto(photo.url, photo.verified))
    .slice(0, 6);

  const photos = allowedPhotoEvidence.map(photo => ({
    url: photo.url,
    caption: photo.caption || `${item.name} product photo`,
    credit: photo.credit,
    type: 'product',
  }));

  return {
    id: item.id,
    name: item.name,
    location: {
      address: item.location.address || 'Unknown',
      city: item.location.city || 'Unknown',
      region: item.location.state,
      country: item.location.country || 'USA',
      lat: item.location.lat,
      lng: item.location.lng,
    },
    description,
    confidence,
    evidence,
    tags: item.characteristics || [],
    attributes: {
      noveltyScore: item.novelty_score ?? null,
      discoveredDate: item.discovered_date ?? null,
      historicalContext: item.historical_context ?? null,
    },
    sources: item.sources || [],
    photos,
    photoEvidence: allowedPhotoEvidence.map(photo => ({
      url: photo.url,
      caption: photo.caption,
      credit: photo.credit,
      verified: !!photo.verified,
    })),
    classification: (item.classification || {}) as Record<string, string | number | boolean>,
  };
});

const lats = entries.map(e => e.location.lat);
const lngs = entries.map(e => e.location.lng);
const minLat = Math.min(...lats);
const maxLat = Math.max(...lats);
const minLng = Math.min(...lngs);
const maxLng = Math.max(...lngs);

const manifest = {
  slug,
  title,
  tagline,
  version: '1.0.0',
  totalEntries: entries.length,
  lastUpdated: new Date().toISOString().split('T')[0],
  defaultCenter: [(minLat + maxLat) / 2, (minLng + maxLng) / 2],
  defaultZoom: 8,
  filterFields: ['city', 'confidence'],
  chunks: ['entries.json'],
  intent: {
    statement: `Document high-confidence ${title.toLowerCase()} practitioners with product-level evidence and verified photo context.`,
    scope: 'Use precise city/state coordinates and preserve niche-style classification metadata.',
    photoPolicy: 'Keep only source-attributed product photos that are archetypical of the map intent.',
  },
  intentHistory: [
    {
      changedAt: new Date().toISOString(),
      author: 'import-enriched-index',
      summary: `Imported ${entries.length} enriched records from external niche index.`,
    },
  ],
  validation: {
    coordinateBounds: {
      minLat: Number((minLat - 0.2).toFixed(6)),
      maxLat: Number((maxLat + 0.2).toFixed(6)),
      minLng: Number((minLng - 0.2).toFixed(6)),
      maxLng: Number((maxLng + 0.2).toFixed(6)),
    },
  },
};

fs.writeFileSync(path.join(mapDir, 'entries.json'), JSON.stringify(entries, null, 2));
fs.writeFileSync(path.join(mapDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

const totalInputPhotos = raw.reduce((sum, item) => sum + (item.photo_evidence?.length || 0), 0);
const totalKeptPhotos = entries.reduce((sum, item) => sum + (item.photoEvidence?.length || 0), 0);

console.log(`Imported ${entries.length} records -> public/data/maps/${slug}/`);
console.log(`Photo evidence kept: ${totalKeptPhotos}/${totalInputPhotos} (verified + non-stock policy)`);
