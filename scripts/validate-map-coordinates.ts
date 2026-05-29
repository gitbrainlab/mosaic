#!/usr/bin/env tsx
/**
 * Mosaic data + coordinate validator.
 *
 * Validates every entries.json passed on the CLI. If a sibling manifest declares
 * validation.coordinateBounds, coordinates are checked against that map-specific
 * area. Global/domain-agnostic maps still get schema, range, count, and image
 * existence checks without being judged against an Albany-only radius.
 */
import fs from 'fs';
import path from 'path';

interface CoordinateBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

interface Manifest {
  slug: string;
  title: string;
  totalEntries: number;
  chunks: string[];
  intent?: {
    statement?: string;
    scope?: string;
    photoPolicy?: string;
  };
  intentHistory?: Array<{
    changedAt: string;
    author: string;
    summary: string;
  }>;
  validation?: {
    coordinateBounds?: CoordinateBounds;
    requireStreetAddress?: boolean;
    requireVerifiedProductPhotos?: boolean;
    requireRecentSignalSince?: number;
    blockedNamePatterns?: string[];
  };
}

const files = process.argv.slice(2).filter(f => fs.existsSync(f));

if (files.length === 0) {
  console.error('No valid entries.json files provided');
  process.exit(1);
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function inBounds(lat: number, lng: number, bounds: CoordinateBounds) {
  return lat >= bounds.minLat &&
    lat <= bounds.maxLat &&
    lng >= bounds.minLng &&
    lng <= bounds.maxLng;
}

function validatePhotoUrl(url: string, entriesFile: string, slug: string): string | null {
  if (!url || url.startsWith('http://') || url.startsWith('https://')) return null;

  let relative = url;
  if (relative.startsWith('/')) relative = relative.slice(1);
  if (relative.startsWith('./images/')) {
    relative = `public/data/maps/${slug}/images/${relative.replace('./images/', '')}`;
  } else if (relative.startsWith('images/')) {
    relative = `public/data/maps/${slug}/images/${relative.replace('images/', '')}`;
  } else if (relative.startsWith('data/')) {
    relative = `public/${relative}`;
  }

  const absolute = path.resolve(path.dirname(entriesFile), relative);
  const repoRelative = path.resolve(relative);
  if (fs.existsSync(absolute) || fs.existsSync(repoRelative)) return null;
  return `photo file missing: ${url}`;
}

function hasPreciseStreetAddress(address: unknown): boolean {
  if (typeof address !== 'string' || address.length < 5) return false;
  if (!/\d/.test(address)) return false;
  return !/(multiple|area|unknown|city center|downtown|various|including|nearby|tbd)/i.test(address);
}

function hasVerifiedProductPhotos(entry: any): boolean {
  const photos = Array.isArray(entry?.photos) ? entry.photos : [];
  const verifiedPhotoEvidence = Array.isArray(entry?.photoEvidence)
    ? entry.photoEvidence.filter((photo: any) => photo?.verified)
    : [];
  return photos.length > 0 && verifiedPhotoEvidence.length > 0;
}

function hasRecentSignal(entry: any, sinceYear: number): boolean {
  const haystack = JSON.stringify({
    evidence: entry?.evidence,
    added: entry?.added,
    lastVerified: entry?.lastVerified,
    attributes: entry?.attributes,
  });

  const years = haystack.match(/20\d{2}/g) || [];
  return years.some(year => Number(year) >= sinceYear);
}

let totalErrors = 0;

for (const file of files) {
  const entries = readJson<any[]>(file);
  const mapDir = path.dirname(file);
  const manifestPath = path.join(mapDir, 'manifest.json');
  const manifest = fs.existsSync(manifestPath) ? readJson<Manifest>(manifestPath) : null;
  const slug = manifest?.slug || path.basename(mapDir);
  const bounds = manifest?.validation?.coordinateBounds;
  let errors = 0;

  console.log(`\nValidating ${slug} (${entries.length} entries)`);

  if (!Array.isArray(entries)) {
    console.error('  BAD: entries.json must contain an array');
    totalErrors++;
    continue;
  }

  if (!manifest) {
    console.error('  BAD: sibling manifest.json missing');
    errors++;
  } else {
    if (manifest.totalEntries !== entries.length) {
      console.error(`  BAD: manifest totalEntries=${manifest.totalEntries}, entries length=${entries.length}`);
      errors++;
    }

    for (const chunk of manifest.chunks || []) {
      if (!fs.existsSync(path.join(mapDir, chunk))) {
        console.error(`  BAD: manifest chunk missing: ${chunk}`);
        errors++;
      }
    }

    if (!manifest.intent?.statement || !manifest.intent?.scope || !manifest.intent?.photoPolicy) {
      console.error('  BAD: manifest intent must include statement, scope, and photoPolicy');
      errors++;
    }

    if (!Array.isArray(manifest.intentHistory) || manifest.intentHistory.length === 0) {
      console.error('  BAD: manifest intentHistory must include at least one change record');
      errors++;
    }
  }

  const seenIds = new Set<string>();

  entries.forEach((entry: any, index: number) => {
    const label = entry?.name || `entry #${index + 1}`;
    const location = entry?.location || {};
    const lat = location.lat;
    const lng = location.lng;

    if (!entry?.id || typeof entry.id !== 'string') {
      console.error(`  BAD: ${label} missing string id`);
      errors++;
    } else if (seenIds.has(entry.id)) {
      console.error(`  BAD: duplicate id ${entry.id}`);
      errors++;
    } else {
      seenIds.add(entry.id);
    }

    if (!entry?.name || typeof entry.name !== 'string') {
      console.error(`  BAD: ${label} missing name`);
      errors++;
    }

    if (!['high', 'medium', 'low'].includes(entry?.confidence)) {
      console.error(`  BAD: ${label} has invalid confidence ${entry?.confidence}`);
      errors++;
    }

    if (!Array.isArray(entry?.evidence) || entry.evidence.length === 0) {
      console.error(`  BAD: ${label} needs at least one evidence item`);
      errors++;
    }

    if (!isFiniteNumber(lat) || !isFiniteNumber(lng)) {
      console.error(`  BAD: ${label} has non-numeric coordinates`);
      errors++;
      return;
    }

    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      console.error(`  BAD: ${label} coordinates outside valid lat/lng range`);
      errors++;
    }

    if (Math.abs(lat) < 0.0001 && Math.abs(lng) < 0.0001) {
      console.error(`  BAD: ${label} appears to be at Null Island`);
      errors++;
    }

    if (bounds && !inBounds(lat, lng, bounds)) {
      console.error(`  BAD: ${label} (${location.city || 'unknown city'}) outside ${slug} coordinate bounds`);
      errors++;
    }

    if (manifest?.validation?.requireStreetAddress && !hasPreciseStreetAddress(location.address)) {
      console.error(`  BAD: ${label} needs a precise street address`);
      errors++;
    }

    if (manifest?.validation?.requireVerifiedProductPhotos && !hasVerifiedProductPhotos(entry)) {
      console.error(`  BAD: ${label} needs verified real product photos`);
      errors++;
    }

    if (manifest?.validation?.requireRecentSignalSince &&
      !hasRecentSignal(entry, manifest.validation.requireRecentSignalSince)) {
      console.error(`  BAD: ${label} needs evidence or metadata from ${manifest.validation.requireRecentSignalSince} or later`);
      errors++;
    }

    for (const pattern of manifest?.validation?.blockedNamePatterns || []) {
      if (new RegExp(pattern, 'i').test(entry.name)) {
        console.error(`  BAD: ${label} matches blocked name pattern ${pattern}`);
        errors++;
      }
    }

    for (const photo of entry.photos || []) {
      const photoError = validatePhotoUrl(photo.url, file, slug);
      if (photoError) {
        console.error(`  BAD: ${label} ${photoError}`);
        errors++;
      }
    }
  });

  console.log(`  Errors in this file: ${errors}`);
  totalErrors += errors;
}

if (totalErrors > 0) {
  console.error(`\nFAILED with ${totalErrors} errors`);
  process.exit(1);
}

console.log('\nOK');
