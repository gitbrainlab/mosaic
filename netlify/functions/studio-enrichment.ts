import type { StudioEnrichmentJobKind, StudioEnrichmentRequest } from '../../src/types/studio-review';
import { requireHuntAccess } from './_shared/auth';
import { createStudioEnrichmentJob, runStudioEnrichmentJob } from './_shared/studio-enrichment-runner';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { loadStudioEnrichmentJob, listStudioEnrichmentJobsForEntry, saveStudioEnrichmentJob } from './_shared/hunt-store';
import { emitStudioWorkload, type StudioWorkloadEventName } from './_shared/workload-client';

const VALID_KINDS: StudioEnrichmentJobKind[] = ['enrich_photos', 'enrich_evidence', 'verify_location', 'refine_profile'];

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  if (req.method === 'GET') {
    const url = new URL(req.url);
    const jobId = url.searchParams.get('jobId') || '';
    const mapSlug = url.searchParams.get('mapSlug') || '';
    const entryId = url.searchParams.get('entryId') || '';

    if (jobId) {
      const job = await loadStudioEnrichmentJob(jobId);
      if (!job) return errorResponse('Studio enrichment job not found.', 404, req);
      return jsonResponse({ job }, 200, req);
    }

    if (mapSlug && entryId) {
      const jobs = await listStudioEnrichmentJobsForEntry(mapSlug, entryId);
      return jsonResponse({ jobs }, 200, req);
    }

    return errorResponse('jobId or mapSlug + entryId is required.', 400, req);
  }

  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  const authError = requireHuntAccess(req);
  if (authError) return authError;

  try {
    const raw = await req.json() as Partial<StudioEnrichmentRequest>;
    const request = normalizeRequest(raw);
    const missing = ['actionType', 'mapSlug', 'entryId'].filter(field => !request[field as keyof StudioEnrichmentRequest]);
    if (missing.length > 0) return errorResponse(`Missing required field(s): ${missing.join(', ')}`, 400, req);
    if (!VALID_KINDS.includes(request.actionType)) return errorResponse(`Unsupported Studio enrichment action: ${request.actionType}`, 400, req);

    const job = createStudioEnrichmentJob(request);
    await saveStudioEnrichmentJob(job);

    if (process.env.MOCK_HUNT_MODE === 'true') {
      const readyJob = await runStudioEnrichmentJob(job.jobId, request, 0);
      return jsonResponse({ job: readyJob }, 200, req);
    }

    await emitStudioWorkload(eventNameFor(request.actionType), { jobId: job.jobId, request });
    return jsonResponse({ job }, 202, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to queue Studio enrichment';
    return errorResponse(message, 500, req);
  }
}

function eventNameFor(kind: StudioEnrichmentJobKind): StudioWorkloadEventName {
  if (kind === 'enrich_photos') return 'studio.enrich_photos';
  if (kind === 'enrich_evidence') return 'studio.enrich_evidence';
  if (kind === 'verify_location') return 'studio.verify_location';
  return 'studio.refine_profile';
}

function normalizeRequest(raw: Partial<StudioEnrichmentRequest>): StudioEnrichmentRequest {
  const actionType = typeof raw.actionType === 'string' ? raw.actionType.trim() as StudioEnrichmentJobKind : 'enrich_evidence';
  return {
    actionType,
    mapSlug: cleanString(raw.mapSlug),
    mapTitle: cleanString(raw.mapTitle),
    entryId: cleanString(raw.entryId),
    entryName: cleanString(raw.entryName),
    entry: raw.entry && typeof raw.entry === 'object' ? raw.entry : undefined,
    issues: Array.isArray(raw.issues) ? raw.issues.filter((item): item is string => typeof item === 'string').slice(0, 20) : [],
    note: cleanString(raw.note, 2000),
  };
}

function cleanString(value: unknown, max = 500): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : '';
}
