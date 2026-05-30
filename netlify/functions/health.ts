import { jsonResponse, optionsResponse } from './_shared/response';
import { hasXaiKey, modelFor } from './_shared/xai-client';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);

  return jsonResponse({
    status: 'ok',
    service: 'mosaic-hunt-gateway',
    mode: process.env.MOCK_HUNT_MODE === 'true' || !hasXaiKey() ? 'fallback' : 'live',
    models: {
      refine: modelFor('refine'),
      draft: modelFor('draft'),
      iterate: modelFor('iterate'),
    },
    netlifyDeployId: process.env.DEPLOY_ID || process.env.NETLIFY_DEPLOY_ID || 'unknown',
    commit: process.env.COMMIT_REF || 'unknown',
    timestamp: new Date().toISOString(),
  }, 200, req);
}
