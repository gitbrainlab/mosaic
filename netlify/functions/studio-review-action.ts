import type { StudioReviewActionPayload, StudioReviewActionRecord } from '../../src/types/studio-review';
import { requireHuntAccess } from './_shared/auth';
import { createId } from './_shared/hunt-generation';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { saveStudioReviewAction } from './_shared/hunt-store';

const REQUIRED_FIELDS: Array<keyof StudioReviewActionPayload> = ['mapSlug', 'entryId', 'action', 'targetState'];

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  const authError = requireHuntAccess(req);
  if (authError) return authError;

  try {
    const body = await req.json() as { action?: Partial<StudioReviewActionPayload> } | Partial<StudioReviewActionPayload>;
    const action = normalizePayload('action' in body && body.action ? body.action : body);
    const missing = REQUIRED_FIELDS.filter(field => !action[field]);
    if (missing.length > 0) {
      return errorResponse(`Missing required field(s): ${missing.join(', ')}`, 400, req);
    }

    const submittedAt = new Date().toISOString();
    const record: StudioReviewActionRecord = {
      mapSlug: action.mapSlug,
      entryId: action.entryId,
      actionType: action.actionType,
      actionMode: action.actionMode,
      action: action.action,
      targetState: action.targetState,
      reason: action.reason,
      createdAt: action.createdAt || submittedAt,
      source: action.source || 'mosaic-studio',
      note: action.note,
      jobId: action.jobId,
      guidanceUpdate: action.guidanceUpdate,
      refinementMode: action.refinementMode,
      id: createId('review', `${action.mapSlug}-${action.entryId}-${action.action}`),
      status: 'submitted',
      submittedAt,
      submittedBy: req.headers.get('x-mosaic-user') || undefined,
    };

    await saveStudioReviewAction(record);
    return jsonResponse({ actionId: record.id, status: record.status, action: record }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to submit Studio review action';
    return errorResponse(message, 500, req);
  }
}

function normalizePayload(raw: Partial<StudioReviewActionPayload>): StudioReviewActionPayload {
  return {
    mapSlug: cleanString(raw.mapSlug),
    entryId: cleanString(raw.entryId),
    actionType: normalizeActionType(raw.actionType || raw.action),
    actionMode: normalizeActionMode(raw.actionMode),
    action: cleanString(raw.action),
    reason: cleanString(raw.reason),
    targetState: cleanString(raw.targetState),
    createdAt: cleanString(raw.createdAt),
    source: cleanString(raw.source),
    note: cleanString(raw.note),
    jobId: cleanString(raw.jobId),
    guidanceUpdate: cleanString(raw.guidanceUpdate, 4000),
    refinementMode: raw.refinementMode === 'live' || raw.refinementMode === 'fallback'
      ? raw.refinementMode
      : undefined,
  };
}

function cleanString(value: unknown): string {
  return typeof value === 'string' ? value.trim().slice(0, 2000) : '';
}

function normalizeActionMode(value: unknown): StudioReviewActionPayload['actionMode'] {
  const normalized = cleanString(value).toLowerCase();
  return normalized === 'batch' ? 'batch' : 'live';
}

function normalizeActionType(value: unknown): StudioReviewActionPayload['actionType'] {
  const normalized = cleanString(value).toLowerCase().replace(/\s+/g, '_');
  if (normalized === 'approve') return 'approve';
  if (normalized === 'reject') return 'reject';
  if (normalized === 'request_refinement') return 'request_refinement';
  if (normalized === 'flag_photo_issue') return 'flag_photo_issue';
  if (normalized === 'flag_evidence_issue') return 'flag_evidence_issue';
  if (normalized === 'find_real_photos' || normalized === 'enrich_photos') return 'enrich_photos';
  if (normalized === 'enrich_evidence') return 'enrich_evidence';
  if (normalized === 'verify_location') return 'verify_location';
  if (normalized === 'refine_profile') return 'refine_profile';
  return 'request_refinement';
}
