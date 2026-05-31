import { requireServiceToken } from './_shared/auth';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { loadPromotionArtifact } from './_shared/hunt-store';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405, req);
  const authError = requireServiceToken(req);
  if (authError) return authError;

  const promotionId = new URL(req.url).searchParams.get('promotionId');
  if (!promotionId) return errorResponse('promotionId is required', 400, req);

  const artifact = await loadPromotionArtifact(promotionId);
  if (!artifact) return errorResponse('Promotion artifact not found', 404, req);

  return jsonResponse(artifact, 200, req);
}
