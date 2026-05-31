import { requireServiceToken } from './_shared/auth';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { eventFor } from './_shared/hunt-generation';
import { loadHuntState, loadPromotionRequest, saveHuntState, savePromotionRequest } from './_shared/hunt-store';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);
  const authError = requireServiceToken(req);
  if (authError) return authError;

  try {
    const body = await req.json() as {
      huntId?: string;
      promotionId?: string;
      conclusion?: string;
      workflowRunUrl?: string;
      error?: string;
    };
    if (!body.huntId || !body.promotionId) return errorResponse('huntId and promotionId are required', 400, req);

    const [state, promotion] = await Promise.all([
      loadHuntState(body.huntId),
      loadPromotionRequest(body.huntId),
    ]);
    if (!state || !promotion || promotion.id !== body.promotionId) return errorResponse('Promotion not found', 404, req);

    const failed = body.conclusion && body.conclusion !== 'success';
    const nextPromotion = {
      ...promotion,
      status: failed ? 'failed' as const : promotion.status,
      workflowRunUrl: body.workflowRunUrl || promotion.workflowRunUrl,
      error: failed ? body.error || `GitHub workflow ended with ${body.conclusion}` : promotion.error,
    };
    const nextState = {
      ...state,
      profile: {
        ...state.profile,
        status: failed ? 'failed' as const : state.profile.status,
        promotion: nextPromotion,
        updatedAt: new Date().toISOString(),
      },
      events: [
        ...state.events,
        eventFor(
          body.huntId,
          failed ? 'promotion_failed' : 'promotion_workflow_reported',
          failed ? nextPromotion.error || 'Promotion workflow failed.' : 'Promotion workflow reported completion.',
          failed ? 'error' : 'status',
        ),
      ],
    };

    await Promise.all([
      savePromotionRequest(nextPromotion),
      saveHuntState(nextState),
    ]);

    return jsonResponse({ ok: true }, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to process promotion callback';
    return errorResponse(message, 500, req);
  }
}
