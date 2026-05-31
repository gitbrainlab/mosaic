#!/usr/bin/env tsx
import fs from 'node:fs';
import path from 'node:path';
import type { HuntSpec } from '../src/types/hunt';

interface GithubIssueEvent {
  issue?: {
    number?: number;
    title?: string;
    body?: string;
    html_url?: string;
    labels?: Array<string | { name?: string }>;
  };
  repository?: {
    full_name?: string;
  };
}

interface ParsedArgs {
  bodyFile?: string;
  title?: string;
  issueNumber?: string;
  issueUrl?: string;
  repository?: string;
  outputRoot: string;
  runtimeEnvFile?: string;
}

interface HuntArtifact {
  schemaVersion: 1;
  huntId: string;
  status: 'queued';
  spec: HuntSpec;
  sourceIssue: {
    number?: number;
    title: string;
    url?: string;
    repository?: string;
    labels: string[];
  };
  artifacts: {
    huntSpec: string;
    status: string;
    rawOutput: string;
    candidates: string;
    evidencePhotoBriefs: string;
    rejectedCandidates: string;
    reviewBatch: string;
  };
  qualityGates: Array<{
    id: string;
    required: boolean;
    description: string;
  }>;
  createdAt: string;
}

const args = parseArgs(process.argv.slice(2));
const event = readGithubEvent();
const issue = event.issue || {};
const body = readBody(args, issue.body || '');
const title = args.title || issue.title || 'Untitled Mosaic Hunt';
const labels = normalizeLabels(issue.labels || []);
const createdAt = new Date().toISOString();
const spec = normalizeHuntSpec(extractEmbeddedSpec(body), title, body, createdAt);
const huntId = spec.id || `hunt-${issue.number || 'manual'}-${slugify(spec.topic || title)}`;
spec.id = huntId;

const artifactDir = path.join(args.outputRoot, 'hunts', huntId);
fs.mkdirSync(artifactDir, { recursive: true });

const relativeRoot = `public/data/research-batches/hunts/${huntId}`;
const artifact: HuntArtifact = {
  schemaVersion: 1,
  huntId,
  status: 'queued',
  spec,
  sourceIssue: {
    number: args.issueNumber ? Number(args.issueNumber) : issue.number,
    title,
    url: args.issueUrl || issue.html_url,
    repository: args.repository || event.repository?.full_name,
    labels,
  },
  artifacts: {
    huntSpec: `${relativeRoot}/hunt-spec.json`,
    status: `${relativeRoot}/status.json`,
    rawOutput: `${relativeRoot}/raw-output.json`,
    candidates: `${relativeRoot}/candidates.json`,
    evidencePhotoBriefs: `${relativeRoot}/evidence-photo-briefs.json`,
    rejectedCandidates: `${relativeRoot}/rejected-candidates.json`,
    reviewBatch: `${relativeRoot}/review-batch.json`,
  },
  qualityGates: [
    {
      id: 'exact_address_required',
      required: true,
      description: 'Every promoted candidate must have a full street-level address.',
    },
    {
      id: 'valid_coordinates_required',
      required: true,
      description: 'Coordinates must be numeric, match the street address, and stay inside declared bounds when present.',
    },
    {
      id: 'recent_evidence_required',
      required: true,
      description: 'Evidence must show the place is current or recently corroborated.',
    },
    {
      id: 'no_generic_filler',
      required: true,
      description: 'Generic chains, stale places, and weak filler stay rejected unless explicitly justified.',
    },
    {
      id: 'verified_real_photos_required',
      required: true,
      description: 'Public promotion requires real, location-tied photos that match the Hunt intent.',
    },
  ],
  createdAt,
};

writeJson(path.join(artifactDir, 'hunt-spec.json'), spec);
writeJson(path.join(artifactDir, 'status.json'), artifact);
writeJson(path.join(artifactDir, 'candidates.json'), []);
writeJson(path.join(artifactDir, 'evidence-photo-briefs.json'), []);
writeJson(path.join(artifactDir, 'rejected-candidates.json'), []);

if (args.runtimeEnvFile) {
  fs.mkdirSync(path.dirname(args.runtimeEnvFile), { recursive: true });
  fs.writeFileSync(args.runtimeEnvFile, [
    `HUNT_ID=${huntId}`,
    `HUNT_TOPIC=${shellValue(spec.topic)}`,
    `HUNT_LOCATION=${shellValue(spec.geography.label)}`,
    `HUNT_SPEC_PATH=${shellValue(path.join(artifactDir, 'hunt-spec.json'))}`,
    `HUNT_ARTIFACT_DIR=${shellValue(artifactDir)}`,
  ].join('\n') + '\n');
}

console.log(JSON.stringify({ huntId, topic: spec.topic, artifactDir }, null, 2));

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    outputRoot: 'public/data/research-batches',
  };

  for (const arg of argv) {
    if (arg.startsWith('--body-file=')) parsed.bodyFile = arg.slice('--body-file='.length);
    if (arg.startsWith('--title=')) parsed.title = arg.slice('--title='.length);
    if (arg.startsWith('--issue-number=')) parsed.issueNumber = arg.slice('--issue-number='.length);
    if (arg.startsWith('--issue-url=')) parsed.issueUrl = arg.slice('--issue-url='.length);
    if (arg.startsWith('--repository=')) parsed.repository = arg.slice('--repository='.length);
    if (arg.startsWith('--output-root=')) parsed.outputRoot = arg.slice('--output-root='.length);
    if (arg.startsWith('--runtime-env-file=')) parsed.runtimeEnvFile = arg.slice('--runtime-env-file='.length);
  }

  return parsed;
}

function readGithubEvent(): GithubIssueEvent {
  const eventPath = process.env.GITHUB_EVENT_PATH;
  if (!eventPath || !fs.existsSync(eventPath)) return {};
  return JSON.parse(fs.readFileSync(eventPath, 'utf8')) as GithubIssueEvent;
}

function readBody(parsed: ParsedArgs, fallback: string) {
  if (!parsed.bodyFile) return fallback;
  return fs.readFileSync(parsed.bodyFile, 'utf8');
}

function extractEmbeddedSpec(body: string): Partial<HuntSpec> | null {
  const marked = body.match(/<!--\s*mosaic-hunt-spec:start\s*-->\s*```json\s*([\s\S]*?)\s*```\s*<!--\s*mosaic-hunt-spec:end\s*-->/i);
  const json = marked?.[1] || body.match(/```json\s*([\s\S]*?)\s*```/i)?.[1];
  if (!json) return null;

  try {
    const parsed = JSON.parse(json.trim());
    if (parsed && typeof parsed === 'object' && Object.keys(parsed).length > 0) {
      return parsed as Partial<HuntSpec>;
    }
  } catch {
    return null;
  }
  return null;
}

function normalizeHuntSpec(raw: Partial<HuntSpec> | null, title: string, body: string, now: string): HuntSpec {
  const topic = cleanText(raw?.topic) || cleanText(title.replace(/^hunt:\s*/i, '')) || 'Untitled Mosaic Hunt';
  const scope = cleanText(raw?.scope) || extractSection(body, 'Scope') || 'Research enough candidates to produce a reviewable first batch.';
  const intent = cleanText(raw?.intent) || `Create a high-quality Mosaic map for "${topic}" with reviewable evidence before public promotion.`;
  const targetEntries = clampNumber(raw?.desiredScale?.targetEntries, 50, 10, 1000);
  const initialEntries = clampNumber(raw?.desiredScale?.initialEntries, Math.min(Math.max(Math.ceil(targetEntries / 8), 8), 40), 1, targetEntries);

  return {
    id: cleanText(raw?.id) || `hunt-${slugify(topic)}-${Date.now()}`,
    title: cleanText(raw?.title) || `Hunt: ${topic}`,
    topic,
    intent,
    scope,
    geography: {
      label: cleanText(raw?.geography?.label) || extractSection(body, 'Location Bounds') || 'Defined by Hunt request',
      coordinateBounds: normalizeBounds(raw?.geography?.coordinateBounds),
    },
    mustHaveConstraints: normalizeList(raw?.mustHaveConstraints, [
      'Exact street-level address for every candidate',
      'Valid coordinates matching that address',
      'Current or recent evidence of relevance',
      'Verified real photos tied to the actual place and map intent',
    ]),
    exclusions: normalizeList(raw?.exclusions, [
      'Stock photos, generic storefronts, parking lots, or unrelated visuals',
      'Closed, stale, or weakly evidenced places',
      'Generic chains or filler unless explicitly requested and justified',
    ]),
    photoPolicy: cleanText(raw?.photoPolicy) || 'Use only real, location-tied photos that visibly show the thing the map is about.',
    desiredScale: {
      initialEntries,
      targetEntries,
    },
    qualityTargets: normalizeList(raw?.qualityTargets, [
      'Research artifacts first; no raw candidate may write directly to public/data/maps',
      'Promotion requires exact address, valid coordinates, recent evidence, and verified real photos',
    ]),
    createdAt: cleanText(raw?.createdAt) || now,
    updatedAt: now,
  };
}

function normalizeBounds(bounds: HuntSpec['geography']['coordinateBounds']) {
  if (!bounds) return undefined;
  const values = [bounds.minLat, bounds.maxLat, bounds.minLng, bounds.maxLng];
  if (!values.every(value => typeof value === 'number' && Number.isFinite(value))) return undefined;
  return bounds;
}

function extractSection(body: string, heading: string) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = body.match(new RegExp(`##\\s+${escaped}\\s*\\n([\\s\\S]*?)(?=\\n##\\s+|$)`, 'i'));
  return cleanText(match?.[1]);
}

function normalizeList(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    const cleaned = value.map(item => cleanText(item)).filter(Boolean);
    if (cleaned.length > 0) return cleaned;
  }
  return fallback;
}

function cleanText(value: unknown) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(Math.max(Math.round(numeric), min), max);
}

function normalizeLabels(labels: Array<string | { name?: string }>) {
  return labels
    .map(label => typeof label === 'string' ? label : label.name || '')
    .filter(Boolean);
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 72) || 'hunt';
}

function shellValue(value: string) {
  return `'${value.replace(/\n/g, ' ').replace(/'/g, `'\\''`)}'`;
}

function writeJson(filePath: string, value: unknown) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}
