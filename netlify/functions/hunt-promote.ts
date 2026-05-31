import type { HuntJob, PromotionRequest } from '../../src/types/hunt';
import { requireHuntAccess } from './_shared/auth';
import { buildPromotionArtifact, inferTargetMapSlug } from './_shared/promotion-artifact';
import { createId } from './_shared/hunt-generation';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { loadHuntState, saveHuntJob, saveHuntState, savePromotionArtifact, savePromotionRequest } from './_shared/hunt-store';
import { emitHuntWorkload } from './_shared/workload-client';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);
  const authError = requireHuntAccess(req);
  if (authError) return authError;

  try {
    const body = await req.json() as { huntId?: string; targetMapSlug?: string };
    if (!body.huntId) return errorResponse('huntId is required', 400, req);

    const state = await loadHuntState(body.huntId);
    if (!state) return errorResponse('Hunt not found', 404, req);
    if (!state.draftMap) return errorResponse('Draft map is not ready yet.', 409, req);

    const targetMapSlug = inferTargetMapSlug(state.profile, body.targetMapSlug);
    const promotion: PromotionRequest = {
      id: createId('promo', state.profile.id),
      huntId: state.profile.id,
      status: 'queued',
      requestedAt: new Date().toISOString(),
      targetMapSlug,
    };
    const artifact = buildPromotionArtifact(state.profile, state.draftMap, targetMapSlug);
    promotion.promotionArtifactKey = await savePromotionArtifact(promotion.id, artifact);

    const job: HuntJob = {
      jobId: createId('job', `${state.profile.id}-promote`),
      huntId: state.profile.id,
      kind: 'promote',
      eventName: 'hunt.promote',
      status: 'queued',
      attemptCount: 0,
      createdAt: promotion.requestedAt,
      targetMapSlug,
      promotionId: promotion.id,
    };

    const nextState = {
      ...state,
      profile: {
        ...state.profile,
        status: 'promotion_queued' as const,
        promotion,
        updatedAt: new Date().toISOString(),
      },
      events: [
        ...state.events,
        {
          ...createPromotionEvent(state.profile.id),
          message: `Promotion dry-run workflow queued for ${targetMapSlug}.`,
        },
      ],
      jobs: [...(state.jobs || []), job],
    };

    await Promise.all([
      savePromotionRequest(promotion),
      saveHuntJob(job),
      saveHuntState(nextState),
    ]);
    await emitHuntWorkload('hunt.promote', { huntId: state.profile.id, jobId: job.jobId, promotionId: promotion.id });

    return jsonResponse({ promotion, state: nextState }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to promote Hunt';
    return errorResponse(message, 500, req);
  }
}

function createPromotionEvent(huntId: string) {
  return {
    id: createId('evt', `${huntId}-promotion-queued`),
    huntId,
    type: 'status',
    stage: 'promotion_queued',
    severity: 'info' as const,
    createdAt: new Date().toISOString(),
    message: 'Promotion workflow queued.',
  };
}
