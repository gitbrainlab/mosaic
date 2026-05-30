import type { PromotionRequest } from '../../src/types/hunt';
import { createPromotionIssue } from './_shared/github-client';
import { createId } from './_shared/hunt-generation';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { loadHuntState, saveHuntState, savePromotionRequest } from './_shared/hunt-store';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  try {
    const body = await req.json() as { huntId?: string };
    if (!body.huntId) return errorResponse('huntId is required', 400, req);

    const state = await loadHuntState(body.huntId);
    if (!state) return errorResponse('Hunt not found', 404, req);

    const promotion: PromotionRequest = {
      id: createId('promo', state.profile.id),
      huntId: state.profile.id,
      status: 'queued',
      requestedAt: new Date().toISOString(),
    };

    try {
      const issueUrl = await createPromotionIssue(state.profile, state.draftMap, promotion);
      if (issueUrl) {
        promotion.status = 'issue_created';
        promotion.githubIssueUrl = issueUrl;
      }
    } catch (err) {
      promotion.status = 'failed';
      promotion.error = err instanceof Error ? err.message : 'GitHub promotion issue failed';
    }

    const nextState = {
      ...state,
      profile: {
        ...state.profile,
        status: 'promotion_requested' as const,
        promotion,
        updatedAt: new Date().toISOString(),
      },
    };

    await Promise.all([
      savePromotionRequest(promotion),
      saveHuntState(nextState),
    ]);

    return jsonResponse({ promotion }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to promote Hunt';
    return errorResponse(message, 500, req);
  }
}
