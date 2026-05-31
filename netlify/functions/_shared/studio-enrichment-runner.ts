import type { KnowledgeEntry } from '../../../src/types';
import type {
  StudioEnrichmentCandidate,
  StudioEnrichmentJob,
  StudioEnrichmentJobKind,
  StudioEnrichmentRequest,
  StudioEnrichmentResult,
} from '../../../src/types/studio-review';
import { chatComplete, extractJsonObject, hasXaiKey, modelFor } from './xai-client';
import { createId } from './hunt-generation';
import { loadStudioEnrichmentJob, saveStudioEnrichmentJob } from './hunt-store';

function now() {
  return new Date().toISOString();
}

function cleanString(value: unknown, max = 4000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0).map(item => item.trim())
    : [];
}

function entryFromRequest(input: StudioEnrichmentRequest): KnowledgeEntry | null {
  if (!input.entry || typeof input.entry !== 'object') return null;
  return input.entry as KnowledgeEntry;
}

function candidateFromPhoto(photo: { url?: string; caption?: string; credit?: string; verified?: boolean }, entry: KnowledgeEntry | null): StudioEnrichmentCandidate {
  return {
    url: cleanString(photo.url),
    sourceUrl: cleanString(photo.url),
    caption: cleanString(photo.caption) || `Existing visual candidate for ${entry?.name || 'this entry'}.`,
    credit: cleanString(photo.credit),
    confidence: photo.verified ? 'medium' : 'low',
    locationTie: photo.verified
      ? 'Existing Mosaic data marks this visual as verified, but curator review is still required before public promotion.'
      : 'Existing Mosaic data has a visual lead, but it still needs source and location review.',
    reviewNote: 'Confirm this is from the exact place and visibly matches the map intent before approving.',
  };
}

function existingPhotoCandidates(entry: KnowledgeEntry | null): StudioEnrichmentCandidate[] {
  if (!entry) return [];
  const photos = [
    ...(entry.photos || []).map(photo => ({
      url: photo.url,
      caption: photo.caption,
      credit: photo.credit,
      verified: photo.type === 'product' || photo.type === 'variant' || photo.type === 'detail',
    })),
    ...(entry.photoEvidence || []).map(photo => ({
      url: photo.url,
      caption: photo.caption,
      credit: photo.credit,
      verified: photo.verified,
    })),
  ];
  return photos.filter(photo => photo.url).slice(0, 6).map(photo => candidateFromPhoto(photo, entry));
}

function sourceNotes(entry: KnowledgeEntry | null): string[] {
  if (!entry) return [];
  return [
    ...(entry.sources || []),
    ...(entry.evidence || []).map(item => [item.source, item.type, item.date, item.url].filter(Boolean).join(' / ')),
  ].filter(Boolean).slice(0, 10);
}

function fallbackResult(input: StudioEnrichmentRequest): StudioEnrichmentResult {
  const entry = entryFromRequest(input);
  const candidates = input.actionType === 'enrich_photos' ? existingPhotoCandidates(entry) : [];
  const evidenceNotes = sourceNotes(entry);
  const place = entry?.name || input.entryName || input.entryId;

  return {
    summary: hasXaiKey()
      ? `Live enrichment did not return parseable candidates for ${place}. Review existing sources and rerun if needed.`
      : `XAI_API_KEY/XAI_KEY is not configured, so this job produced a safe fallback brief for ${place}.`,
    candidates,
    evidenceNotes: evidenceNotes.length > 0 ? evidenceNotes : ['No source URLs were present in the selected entry snapshot.'],
    rejectionNotes: [
      'Do not approve stock photos, generic storefront images, or images that cannot be tied to the exact place.',
      'Public map data must still pass GitHub validation before promotion.',
    ],
    generatedAt: now(),
    mode: 'fallback',
  };
}

function normalizeCandidate(raw: Record<string, unknown>, entry: KnowledgeEntry | null): StudioEnrichmentCandidate {
  const confidence = raw.confidence === 'high' || raw.confidence === 'medium' || raw.confidence === 'low'
    ? raw.confidence
    : 'low';

  return {
    url: cleanString(raw.url || raw.photoUrl),
    sourceUrl: cleanString(raw.sourceUrl || raw.pageUrl || raw.url),
    caption: cleanString(raw.caption) || `Photo lead for ${entry?.name || 'selected entry'}.`,
    credit: cleanString(raw.credit),
    confidence,
    locationTie: cleanString(raw.locationTie, 1200) || 'Needs curator review for exact-location fit.',
    reviewNote: cleanString(raw.reviewNote, 1200) || 'Open the source and verify the photo belongs to this exact place before approving.',
  };
}

function normalizeResult(raw: Record<string, unknown>, input: StudioEnrichmentRequest): StudioEnrichmentResult {
  const entry = entryFromRequest(input);
  const candidates = Array.isArray(raw.candidates)
    ? raw.candidates.slice(0, 8).map(item => normalizeCandidate(item as Record<string, unknown>, entry))
    : [];

  return {
    summary: cleanString(raw.summary, 2000) || fallbackResult(input).summary,
    candidates,
    evidenceNotes: asStringArray(raw.evidenceNotes).slice(0, 10),
    rejectionNotes: asStringArray(raw.rejectionNotes).slice(0, 10),
    generatedAt: now(),
    mode: 'live',
  };
}

async function generateLiveResult(input: StudioEnrichmentRequest): Promise<StudioEnrichmentResult> {
  const entry = entryFromRequest(input);
  const prompt = {
    actionType: input.actionType,
    mapSlug: input.mapSlug,
    mapTitle: input.mapTitle,
    entryId: input.entryId,
    entryName: input.entryName,
    issues: input.issues || [],
    note: input.note || '',
    entry,
  };

  const raw = await chatComplete([
    {
      role: 'system',
      content: [
        'You are Mosaic Studio enrichment support.',
        'Return only JSON with keys: summary, candidates, evidenceNotes, rejectionNotes.',
        'For photo enrichment, candidates must be real source/photo leads tied to the exact place; never use stock or generic images.',
        'If you cannot identify a real URL confidently, return an evidence/source lead and explain that the photo URL still needs sourcing.',
        'These results are provisional and require curator review plus GitHub validation before public promotion.',
      ].join(' '),
    },
    {
      role: 'user',
      content: JSON.stringify(prompt, null, 2),
    },
  ], {
    model: modelFor('draft'),
    jsonMode: true,
    maxTokens: 2400,
    temperature: 0.2,
    timeoutMs: 40000,
  });

  return normalizeResult(JSON.parse(extractJsonObject(raw)) as Record<string, unknown>, input);
}

export function createStudioEnrichmentJob(input: StudioEnrichmentRequest): StudioEnrichmentJob {
  const timestamp = now();
  return {
    jobId: createId('studiojob', `${input.mapSlug}-${input.entryId}-${input.actionType}`),
    mapSlug: cleanString(input.mapSlug),
    mapTitle: cleanString(input.mapTitle),
    entryId: cleanString(input.entryId),
    entryName: cleanString(input.entryName),
    kind: input.actionType as StudioEnrichmentJobKind,
    status: 'queued',
    attemptCount: 0,
    createdAt: timestamp,
  };
}

export async function runStudioEnrichmentJob(jobId: string, input: StudioEnrichmentRequest, attempt = 0): Promise<StudioEnrichmentJob> {
  const stored = await loadStudioEnrichmentJob(jobId);
  if (!stored) throw new Error(`Studio enrichment job not found: ${jobId}`);

  const running: StudioEnrichmentJob = {
    ...stored,
    status: 'running',
    attemptCount: Math.max(stored.attemptCount, attempt + 1),
    startedAt: stored.startedAt || now(),
    lastError: undefined,
  };
  await saveStudioEnrichmentJob(running);

  try {
    const result = hasXaiKey() && process.env.MOCK_HUNT_MODE !== 'true'
      ? await generateLiveResult(input)
      : fallbackResult(input);

    const ready: StudioEnrichmentJob = {
      ...running,
      status: 'ready',
      completedAt: now(),
      result: result.candidates.length > 0 || result.evidenceNotes.length > 0 ? result : fallbackResult(input),
    };
    await saveStudioEnrichmentJob(ready);
    return ready;
  } catch (err) {
    const failed: StudioEnrichmentJob = {
      ...running,
      status: 'failed',
      completedAt: now(),
      lastError: err instanceof Error ? err.message : 'Studio enrichment failed',
      result: fallbackResult(input),
    };
    await saveStudioEnrichmentJob(failed);
    throw err;
  }
}
