#!/usr/bin/env tsx
/**
 * Batch Aggregator
 *
 * Merges multiple research run outputs into one clean, deduplicated set of entries.
 * Useful for combining several rich-research runs to reach higher entry counts
 * (e.g. 20+ Ice Cream spots) while keeping the best photoBriefs and evidence.
 *
 * Usage examples:
 *   npx tsx scripts/aggregate-research-runs.ts data/research-runs/ice-cream-*.json --output combined-ice-cream.json
 *   npx tsx scripts/aggregate-research-runs.ts "data/research-runs/ice-cream*.json" --slug=ice-cream-capital-district --ingest
 */

import fs from 'fs';
import path from 'path';
import { glob } from 'tinyglobby';

interface KnowledgeEntry {
  id: string;
  name: string;
  location: {
    address: string;
    city: string;
    region?: string;
    country: string;
    lat: number;
    lng: number;
  };
  description: string;
  confidence: 'high' | 'medium' | 'low';
  evidence: any[];
  tags: string[];
  attributes?: Record<string, any>;
  photos?: any[];
  photoBriefs?: any[];
}

interface ResearchRun {
  topic: string;
  entries: KnowledgeEntry[];
  meta?: any;
}

interface AggregateOptions {
  inputs: string[];
  output?: string;
  slug?: string;
  ingest?: boolean;
  strategy?: 'best' | 'merge';
}

function normalizeKey(entry: KnowledgeEntry): string {
  const name = entry.name.toLowerCase().trim();
  const city = entry.location.city.toLowerCase().trim();
  return `${name}::${city}`;
}

function scoreEntry(entry: KnowledgeEntry): number {
  let score = 0;

  // Confidence weighting
  if (entry.confidence === 'high') score += 10;
  else if (entry.confidence === 'medium') score += 5;
  else score += 1;

  // Evidence richness
  score += entry.evidence.length * 2;

  // Photo briefs
  if (entry.photoBriefs) score += entry.photoBriefs.length * 3;
  if (entry.photos) score += entry.photos.length * 2;

  // Description quality (rough heuristic)
  if (entry.description && entry.description.length > 120) score += 3;

  return score;
}

function mergeEntries(a: KnowledgeEntry, b: KnowledgeEntry): KnowledgeEntry {
  const winner = scoreEntry(a) >= scoreEntry(b) ? a : b;
  const loser = winner === a ? b : a;

  // Merge photoBriefs
  const photoBriefs = [...(winner.photoBriefs || []), ...(loser.photoBriefs || [])];
  const seenQueries = new Set(photoBriefs.map(p => p.searchQuery));
  const uniquePhotoBriefs = photoBriefs.filter(p => {
    if (seenQueries.has(p.searchQuery)) return false;
    seenQueries.add(p.searchQuery);
    return true;
  });

  // Merge evidence (simple concat + dedup by source)
  const evidence = [...winner.evidence, ...loser.evidence];
  const seenSources = new Set(evidence.map(e => e.source?.toLowerCase()));
  const uniqueEvidence = evidence.filter(e => {
    const key = e.source?.toLowerCase();
    if (seenSources.has(key)) return false;
    seenSources.add(key);
    return true;
  });

  return {
    ...winner,
    evidence: uniqueEvidence,
    photoBriefs: uniquePhotoBriefs.length > 0 ? uniquePhotoBriefs : winner.photoBriefs,
    tags: [...new Set([...(winner.tags || []), ...(loser.tags || [])])],
  };
}

async function aggregate(options: AggregateOptions) {
  const files: string[] = [];

  for (const pattern of options.inputs) {
    const matches = await glob(pattern);
    files.push(...matches);
  }

  if (files.length === 0) {
    console.error('No research run files found.');
    process.exit(1);
  }

  console.log(`Found ${files.length} research runs to aggregate...`);

  const allEntries: KnowledgeEntry[] = [];
  const runInfos: any[] = [];

  for (const file of files) {
    const run: ResearchRun = JSON.parse(fs.readFileSync(file, 'utf8'));
    allEntries.push(...run.entries);
    runInfos.push({
      file,
      topic: run.topic,
      count: run.entries.length,
    });
  }

  console.log(`Total raw entries before dedup: ${allEntries.length}`);

  // Deduplicate + merge
  const byKey = new Map<string, KnowledgeEntry>();

  for (const entry of allEntries) {
    const key = normalizeKey(entry);
    if (!byKey.has(key)) {
      byKey.set(key, entry);
    } else {
      const existing = byKey.get(key)!;
      const merged = mergeEntries(existing, entry);
      byKey.set(key, merged);
    }
  }

  const finalEntries = Array.from(byKey.values());

  console.log(`Unique entries after dedup + merge: ${finalEntries.length}`);

  const result = {
    topic: options.slug || 'Aggregated Research',
    aggregatedFrom: runInfos,
    aggregatedAt: new Date().toISOString(),
    totalUniqueEntries: finalEntries.length,
    entries: finalEntries,
  };

  if (options.output) {
    fs.writeFileSync(options.output, JSON.stringify(result, null, 2));
    console.log(`\n✅ Aggregated output written to: ${options.output}`);
  }

  if (options.slug) {
    const mapDir = path.join('public', 'data', 'maps', options.slug);
    fs.mkdirSync(mapDir, { recursive: true });

    const entriesPath = path.join(mapDir, 'entries.json');
    fs.writeFileSync(entriesPath, JSON.stringify(finalEntries, null, 2));

    // Update manifest total
    const manifestPath = path.join(mapDir, 'manifest.json');
    if (fs.existsSync(manifestPath)) {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
      manifest.totalEntries = finalEntries.length;
      manifest.lastUpdated = new Date().toISOString().split('T')[0];
      fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    }

    console.log(`✅ Ingested ${finalEntries.length} unique entries into public/data/maps/${options.slug}/`);
  }

  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const inputs = args.filter(a => !a.startsWith('--'));
  const slug = args.find(a => a.startsWith('--slug='))?.split('=')[1];
  const output = args.find(a => a.startsWith('--output='))?.split('=')[1];
  const ingest = args.includes('--ingest');

  if (inputs.length === 0) {
    console.error('Usage: npx tsx scripts/aggregate-research-runs.ts <glob or files...> [--slug=...] [--output=...] [--ingest]');
    process.exit(1);
  }

  await aggregate({
    inputs,
    slug,
    output,
    ingest,
  });
}

main().catch(console.error);
