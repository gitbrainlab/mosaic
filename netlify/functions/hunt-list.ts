import { jsonResponse, optionsResponse, errorResponse } from './_shared/response';
import { listHunts } from './_shared/hunt-store';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'GET') return errorResponse('Method not allowed', 405, req);

  const hunts = await listHunts();
  return jsonResponse({ hunts }, 200, req);
}
