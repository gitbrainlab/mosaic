import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { loadHuntState } from './_shared/hunt-store';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405, req);

  const id = new URL(req.url).searchParams.get('id');
  if (!id) return errorResponse('id is required', 400, req);

  const state = await loadHuntState(id);
  if (!state) return errorResponse('Hunt not found', 404, req);

  return jsonResponse(state, 200, req);
}
