#!/usr/bin/env tsx
/**
 * Playwright source verifier for Mosaic enrichment artifacts.
 *
 * This is the browser-side bridge after a deep research pass finds concrete
 * source URLs. It visits those URLs, extracts visible verification signals,
 * scores product-like image candidates, and writes an evidence artifact.
 *
 * It never promotes entries into public map data.
 *
 * Usage:
 *   npx tsx scripts/verify-enrichment-sources.ts \
 *     --input=public/data/maps/ice-cream-nationwide-albany-radial/entries.json \
 *     --limit=3 \
 *     --max-urls=4
 */
import fs from 'fs';
import path from 'path';
import { chromium, type Page } from 'playwright';

interface SourceEntry {
  id?: string;
  name: string;
  location?: {
    address?: string;
    city?: string;
    region?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  sources?: string[];
  evidence?: Array<{ url?: string; source?: string; detail?: string; date?: string; type?: string }>;
  photos?: Array<{ url?: string; caption?: string; credit?: string; type?: string }>;
  photoEvidence?: Array<{ url?: string; caption?: string; credit?: string; verified?: boolean }>;
}

interface VerificationTarget {
  entryId?: string;
  entryName: string;
  expectedAddress?: string;
  expectedCity?: string;
  expectedRegion?: string;
  url: string;
  sourceKind: 'source' | 'evidence' | 'photo';
}

const PRODUCT_TERMS = [
  'ice cream',
  'gelato',
  'custard',
  'soft serve',
  'sundae',
  'cone',
  'scoop',
  'shake',
  'milkshake',
  'sorbet',
  'paleta',
  'frozen yogurt',
  'gluten free',
  'gluten-free',
];

const REJECT_IMAGE_TERMS = [
  'logo',
  'icon',
  'avatar',
  'map',
  'marker',
  'sprite',
  'pixel',
  'tracking',
  'placeholder',
  'storefront',
  'exterior',
];

function argValue(name: string, fallback?: string) {
  const arg = process.argv.find(item => item.startsWith(`--${name}=`));
  return arg ? arg.slice(name.length + 3) : fallback;
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T;
}

function slugify(text: string) {
  return text.toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function normalizeUrl(url: unknown): string | null {
  if (typeof url !== 'string') return null;
  if (!/^https?:\/\//i.test(url)) return null;
  return url.trim();
}

function extractEntries(raw: any): SourceEntry[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.passed)) return raw.passed;
  if (Array.isArray(raw.entries)) return raw.entries;
  throw new Error('Input JSON must be an entries array or contain passed[]/entries[].');
}

function collectTargets(entries: SourceEntry[], maxUrlsPerEntry: number): VerificationTarget[] {
  const targets: VerificationTarget[] = [];

  for (const entry of entries) {
    const urls: Array<{ url: string; sourceKind: VerificationTarget['sourceKind'] }> = [];

    for (const photo of [...(entry.photoEvidence || []), ...(entry.photos || [])]) {
      const url = normalizeUrl(photo.url);
      if (url) urls.push({ url, sourceKind: 'photo' });
    }

    for (const source of entry.sources || []) {
      const url = normalizeUrl(source);
      if (url) urls.push({ url, sourceKind: 'source' });
    }

    for (const evidence of entry.evidence || []) {
      const url = normalizeUrl(evidence.url);
      if (url) urls.push({ url, sourceKind: 'evidence' });
    }

    const seen = new Set<string>();
    for (const item of urls) {
      if (seen.has(item.url)) continue;
      seen.add(item.url);
      targets.push({
        entryId: entry.id,
        entryName: entry.name,
        expectedAddress: entry.location?.address,
        expectedCity: entry.location?.city,
        expectedRegion: entry.location?.region,
        url: item.url,
        sourceKind: item.sourceKind,
      });
      if (seen.size >= maxUrlsPerEntry) break;
    }
  }

  return targets;
}

function includesAny(haystack: string, needles: string[]) {
  const lower = haystack.toLowerCase();
  return needles.some(needle => lower.includes(needle));
}

function signalSnippets(text: string, terms: string[], max = 8) {
  const compact = text.replace(/\s+/g, ' ').trim();
  const snippets: Array<{ term: string; text: string }> = [];

  for (const term of terms) {
    const index = compact.toLowerCase().indexOf(term.toLowerCase());
    if (index < 0) continue;
    const start = Math.max(0, index - 90);
    const end = Math.min(compact.length, index + term.length + 140);
    snippets.push({ term, text: compact.slice(start, end) });
    if (snippets.length >= max) break;
  }

  return snippets;
}

async function pageText(page: Page) {
  return page.locator('body').innerText({ timeout: 3000 }).catch(() => '');
}

async function verifyTarget(page: Page, target: VerificationTarget) {
  const startedAt = new Date().toISOString();
  const result: any = {
    ...target,
    startedAt,
    loaded: false,
    finalUrl: null,
    title: null,
    canonicalUrl: null,
    metaDescription: null,
    addressSignals: [],
    productSignals: [],
    currentSignals: [],
    socialLinks: [],
    photoCandidates: [],
    errors: [],
  };

  try {
    const response = await page.goto(target.url, { waitUntil: 'domcontentloaded', timeout: 18000 });
    result.loaded = Boolean(response && response.ok());
    result.status = response?.status() ?? null;
    result.finalUrl = page.url();
    result.title = await page.title();
    result.canonicalUrl = await page.locator('link[rel="canonical"]').first().getAttribute('href').catch(() => null);
    result.metaDescription = await page.locator('meta[name="description"]').first().getAttribute('content').catch(() => null);

    const text = await pageText(page);
    const addressTerms = [
      target.expectedAddress || '',
      target.expectedCity || '',
      target.expectedRegion || '',
    ].filter(Boolean);

    result.addressSignals = signalSnippets(text, addressTerms);
    result.productSignals = signalSnippets(text, PRODUCT_TERMS);
    result.currentSignals = signalSnippets(text, ['2026', '2025', '2024', '2023', 'hours', 'menu', 'order online', 'open']);

    result.socialLinks = await page.$$eval('a[href]', links => links
      .map(link => (link as HTMLAnchorElement).href)
      .filter(href => /instagram\.com|facebook\.com|tiktok\.com|x\.com|twitter\.com/i.test(href))
      .slice(0, 12)
    ).catch(() => []);

    // Use string evaluation because tsx/esbuild can inject helper symbols into
    // serialized functions that Playwright evaluates in the browser context.
    result.photoCandidates = await page.evaluate(`(() => {
      const productTerms = ${JSON.stringify(PRODUCT_TERMS)};
      const rejectTerms = ${JSON.stringify(REJECT_IMAGE_TERMS)};
      const lower = value => (value || '').toLowerCase();
      const absolutize = src => {
        try {
          return new URL(src, document.baseURI).href;
        } catch {
          return src;
        }
      };

      return Array.from(document.images).map(img => {
        const src = img.currentSrc || img.src || img.getAttribute('data-src') || img.getAttribute('data-lazy-src') || '';
        const alt = img.alt || '';
        const nearbyText = [
          img.closest('figure')?.textContent || '',
          img.parentElement?.textContent || '',
        ].join(' ').replace(/\\s+/g, ' ').trim().slice(0, 300);
        const haystack = lower(src + ' ' + alt + ' ' + nearbyText);
        const matchedProductTerms = productTerms.filter(term => haystack.includes(term));
        const matchedRejectTerms = rejectTerms.filter(term => haystack.includes(term));
        const width = img.naturalWidth || img.width || 0;
        const height = img.naturalHeight || img.height || 0;
        const isTiny = width > 0 && height > 0 && (width < 120 || height < 120);
        const rejectReason = !src
          ? 'missing_src'
          : matchedRejectTerms.length > 0
            ? 'reject_term:' + matchedRejectTerms.join(',')
            : isTiny
              ? 'too_small'
              : null;

        return {
          url: absolutize(src),
          alt,
          nearbyText,
          width,
          height,
          matchedProductTerms,
          score: matchedProductTerms.length * 2 + (width >= 300 && height >= 200 ? 1 : 0),
          rejectReason,
        };
      })
        .filter(item => item.url && /^https?:\\/\\//i.test(item.url))
        .sort((a, b) => b.score - a.score)
        .slice(0, 12);
    })()`).catch(error => {
      result.errors.push(`image_extract_failed:${error.message}`);
      return [];
    });
  } catch (error: any) {
    result.errors.push(error.message);
  }

  result.completedAt = new Date().toISOString();
  return result;
}

const inputPath = argValue('input');
const outDir = argValue('out-dir', 'data/enrichment-runs')!;
const limit = Number(argValue('limit', '5'));
const maxUrls = Number(argValue('max-urls', '4'));

if (!inputPath) {
  console.error('Usage: npx tsx scripts/verify-enrichment-sources.ts --input=<entries-or-enrichment-json> [--limit=5] [--max-urls=4]');
  process.exit(1);
}

const input = readJson<any>(inputPath);
const entries = extractEntries(input).slice(0, limit);
const targets = collectTargets(entries, maxUrls);
const generatedAt = new Date().toISOString();
const runId = `${slugify(path.basename(inputPath, '.json'))}-${generatedAt.replace(/[:.]/g, '-')}`;

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox'],
});

const context = await browser.newContext({
  userAgent: 'Mozilla/5.0 (compatible; MosaicResearchBot/1.0; +https://gitbrain.com/mosaic/v2)',
  viewport: { width: 1366, height: 900 },
});

const page = await context.newPage();
const verifications = [];

for (const target of targets) {
  console.log(`Verifying ${target.entryName}: ${target.url}`);
  verifications.push(await verifyTarget(page, target));
  await page.waitForTimeout(750);
}

await browser.close();

const artifact = {
  generatedAt,
  sourceInput: inputPath,
  status: 'verification_artifact_only',
  publicPromotionAllowed: false,
  entriesConsidered: entries.length,
  targetCount: targets.length,
  verifications,
  nextSteps: [
    'Review addressSignals, productSignals, currentSignals, and photoCandidates.',
    'Use this artifact as supporting evidence only; do not promote entries until human/agent review confirms exact address and real product photos.',
    'For candidates without concrete URLs, run the deep research prompt pack first, then feed its passed[] artifact into this verifier.',
  ],
};

fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${runId}-source-verification.json`);
fs.writeFileSync(outFile, `${JSON.stringify(artifact, null, 2)}\n`);

console.log(`Wrote source verification artifact: ${outFile}`);
console.log(`Targets verified: ${targets.length}`);
