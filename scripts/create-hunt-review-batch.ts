#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import type { HuntSpec } from '../src/types/hunt';
import type { KnowledgeEntry, ResearchBatch } from '../src/types';

interface ResearchResult {
  topic?: string;
  batchId?: string;
  entries?: Array<KnowledgeEntry & {
    photoBriefs?: Array<{
      searchQuery: string;
      expectedVisual: string;
      priority: 'high' | 'medium';
      suggestedSource?: string;
    }>;
  }>;
  rejectedCandidates?: Array<{ name: string; reason: string }>;
  meta?: {
    model?: string;
    timestamp?: string;
    notes?: string;
  };
}

interface Args {
  huntSpec: string;
  researchOutput?: string;
  batchIndex: string;
}

const args = parseArgs(process.argv.slice(2));
const spec = readJson<HuntSpec>(args.huntSpec);
const artifactDir = path.dirname(args.huntSpec);
const relativeDir = toPublicDataPath(artifactDir);
const research = args.researchOutput && fs.existsSync(args.researchOutput)
  ? readJson<ResearchResult>(args.researchOutput)
  : { entries: [] };
const entries = research.entries || [];
const createdAt = spec.createdAt || new Date().toISOString();
const completedAt = research.meta?.timestamp || new Date().toISOString();
const candidates = entries.map(entry => ({
  entry,
  reviewState: entryReviewState(entry, spec),
  qualityIssues: qualityIssues(entry, spec),
}));
const photoBriefs = entries.map(entry => ({
  entryId: entry.id,
  name: entry.name,
  city: entry.location?.city,
  photoBriefs: entry.photoBriefs || [],
  existingPhotos: entry.photos || entry.photoEvidence || [],
  reviewState: 'needs_photo_review',
}));
const rejectedCandidates = research.rejectedCandidates || [];

copyRawResearch(args.researchOutput, path.join(artifactDir, 'raw-output.json'));
writeJson(path.join(artifactDir, 'candidates.json'), candidates);
writeJson(path.join(artifactDir, 'evidence-photo-briefs.json'), photoBriefs);
writeJson(path.join(artifactDir, 'rejected-candidates.json'), rejectedCandidates);

const reviewBatch = buildReviewBatch(spec, research, entries, relativeDir, createdAt, completedAt);
const reviewBatchPath = path.join(artifactDir, 'review-batch.json');
writeJson(reviewBatchPath, reviewBatch);
updateBatchIndex(args.batchIndex, spec, reviewBatch);

console.log(JSON.stringify({
  huntId: spec.id,
  entries: entries.length,
  reviewBatch: reviewBatchPath,
  status: reviewBatch.status,
}, null, 2));

function buildReviewBatch(
  spec: HuntSpec,
  research: ResearchResult,
  entries: KnowledgeEntry[],
  relativeDir: string,
  createdAt: string,
  completedAt: string,
): ResearchBatch & Record<string, unknown> {
  const withPhotoBriefs = entries.filter(entry => (entry as any).photoBriefs?.length || entry.photos?.length || entry.photoEvidence?.length).length;
  const confidence = averageConfidence(entries);
  const hasResearchOutput = Boolean(research.meta || entries.length > 0);

  return {
    id: spec.id,
    name: spec.title,
    topic: spec.topic,
    createdAt,
    status: hasResearchOutput ? 'ready-for-review' : 'proposed',
    source: {
      type: 'github-issue',
      reference: '',
    },
    runs: hasResearchOutput ? [{
      id: `${spec.id}-run-1`,
      batchId: spec.id,
      startedAt: createdAt,
      completedAt,
      modelConfig: {
        models: [research.meta?.model || 'unknown'],
        locationTargets: [spec.geography.label],
        perLocationLimit: spec.desiredScale.initialEntries,
      },
      summary: {
        totalCandidates: entries.length,
        entriesProduced: entries.length,
        photosWithBriefs: withPhotoBriefs,
        averageConfidence: confidence,
      },
      outputFile: `${relativeDir}/raw-output.json`,
      githubRunUrl: process.env.GITHUB_SERVER_URL && process.env.GITHUB_REPOSITORY && process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
        : undefined,
    }] : [],
    summary: {
      totalProfiles: entries.length,
      profilesWithPhotos: withPhotoBriefs,
      locationsCovered: Array.from(new Set(entries.map(entry => [entry.location?.city, entry.location?.region || entry.location?.country].filter(Boolean).join(', ')).filter(Boolean))).sort(),
      lastEnrichedAt: hasResearchOutput ? completedAt : undefined,
    },
    notes: [
      'GitHub-native Hunt artifact. Review and quality gates must pass before public map promotion.',
      spec.photoPolicy,
    ].join(' '),
    reviewState: hasResearchOutput ? 'needs verification' : 'queued',
    workflowStates: [
      { state: 'queued', complete: true },
      { state: 'researching', complete: hasResearchOutput },
      { state: 'needs verification', complete: hasResearchOutput },
      { state: 'needs photo review', complete: false },
      { state: 'promotion preview', complete: false },
      { state: 'approved', complete: false },
      { state: 'rejected/refinement requested', complete: false },
    ],
    artifacts: [
      { label: 'Hunt Spec', path: `${relativeDir}/hunt-spec.json`, kind: 'spec' },
      { label: 'Raw Output', path: `${relativeDir}/raw-output.json`, kind: 'raw' },
      { label: 'Candidates', path: `${relativeDir}/candidates.json`, kind: 'candidates' },
      { label: 'Evidence / Photo Briefs', path: `${relativeDir}/evidence-photo-briefs.json`, kind: 'photo-review' },
      { label: 'Rejected Candidates', path: `${relativeDir}/rejected-candidates.json`, kind: 'rejections' },
    ],
    promotion: {
      approvalRequired: true,
      workflow: '.github/workflows/hunt-promotion.yml',
      publicDataBlockedUntilApproved: true,
    },
    qualityGates: [
      'exact_address_required',
      'valid_coordinates_required',
      'recent_evidence_required',
      'no_generic_filler',
      'verified_real_photos_required',
    ],
  };
}

function qualityIssues(entry: KnowledgeEntry, spec: HuntSpec) {
  const issues: string[] = [];
  const address = entry.location?.address || '';
  const lat = entry.location?.lat;
  const lng = entry.location?.lng;

  if (!/\d/.test(address) || /\b(area|region|unknown|tbd|various)\b/i.test(address)) {
    issues.push('exact_address_required');
  }
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || (lat === 0 && lng === 0)) {
    issues.push('valid_coordinates_required');
  }
  const bounds = spec.geography.coordinateBounds;
  if (bounds && Number.isFinite(lat) && Number.isFinite(lng)) {
    if (lat < bounds.minLat || lat > bounds.maxLat || lng < bounds.minLng || lng > bounds.maxLng) {
      issues.push('coordinates_out_of_bounds');
    }
  }
  if (!hasRecentEvidence(entry)) {
    issues.push('recent_evidence_required');
  }
  if (isLikelyGenericFiller(entry.name)) {
    issues.push('generic_chain_or_filler_review');
  }
  if (!hasVerifiedPhotos(entry)) {
    issues.push('verified_real_photos_required');
  }
  return issues;
}

function entryReviewState(entry: KnowledgeEntry, spec: HuntSpec) {
  const issues = qualityIssues(entry, spec);
  if (issues.some(issue => /photo/i.test(issue))) return 'needs_photo_review';
  if (issues.length > 0) return 'needs_verification';
  return 'promotion_preview';
}

function hasRecentEvidence(entry: KnowledgeEntry) {
  const thresholdYear = new Date().getFullYear() - 4;
  if (entry.lastVerified && Number(entry.lastVerified.slice(0, 4)) >= thresholdYear) return true;
  return (entry.evidence || []).some(evidence => {
    const year = Number(`${evidence.date || ''}`.match(/\b(20\d{2})\b/)?.[1]);
    return Number.isFinite(year) && year >= thresholdYear;
  });
}

function hasVerifiedPhotos(entry: KnowledgeEntry) {
  if (entry.photos?.some(photo => photo.url && !/^https:\/\/images\.unsplash\.com/i.test(photo.url))) return true;
  return entry.photoEvidence?.some(photo => photo.url && photo.verified === true) || false;
}

function isLikelyGenericFiller(name: string) {
  return /\b(stewart'?s|dairy queen|cold stone|baskin|mcdonald|wendy|burger king|sonic)\b/i.test(name);
}

function averageConfidence(entries: KnowledgeEntry[]): 'high' | 'medium' | 'low' | 'mixed' {
  if (entries.length === 0) return 'mixed';
  const values = new Set(entries.map(entry => entry.confidence));
  if (values.size === 1) return entries[0].confidence;
  return 'mixed';
}

function updateBatchIndex(indexPath: string, spec: HuntSpec, batch: ResearchBatch) {
  const index = fs.existsSync(indexPath)
    ? readJson<any>(indexPath)
    : { version: 1, lastUpdated: '', batches: [] };
  const file = `hunts/${spec.id}/review-batch.json`;
  const summary = {
    id: spec.id,
    name: batch.name,
    topic: batch.topic,
    status: batch.status,
    totalProfiles: batch.summary.totalProfiles,
    profilesWithPhotos: batch.summary.profilesWithPhotos,
    createdAt: batch.createdAt,
    file,
  };

  index.version = index.version || 1;
  index.lastUpdated = new Date().toISOString().slice(0, 10);
  index.batches = [
    summary,
    ...(index.batches || []).filter((item: { id: string }) => item.id !== spec.id),
  ];
  writeJson(indexPath, index);
}

function parseArgs(argv: string[]): Args {
  const parsed: Args = {
    huntSpec: '',
    batchIndex: 'public/data/research-batches/index.json',
  };

  for (const arg of argv) {
    if (arg.startsWith('--hunt-spec=')) parsed.huntSpec = arg.slice('--hunt-spec='.length);
    if (arg.startsWith('--research-output=')) parsed.researchOutput = arg.slice('--research-output='.length);
    if (arg.startsWith('--batch-index=')) parsed.batchIndex = arg.slice('--batch-index='.length);
  }

  if (!parsed.huntSpec) {
    throw new Error('Missing --hunt-spec=path/to/hunt-spec.json');
  }

  return parsed;
}

function copyRawResearch(source: string | undefined, target: string) {
  if (!source || !fs.existsSync(source)) {
    writeJson(target, { entries: [], meta: { notes: 'Research output not created yet.' } });
    return;
  }
  if (path.resolve(source) === path.resolve(target)) return;
  fs.copyFileSync(source, target);
}

function toPublicDataPath(absoluteOrRelative: string) {
  const normalized = absoluteOrRelative.replace(/\\/g, '/');
  const marker = 'public/data/research-batches/';
  const index = normalized.indexOf(marker);
  if (index >= 0) return `public/data/research-batches/${normalized.slice(index + marker.length)}`;
  return normalized;
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, 'utf8')) as T;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
