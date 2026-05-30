import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { refineHunt } from './_shared/hunt-generation';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  try {
    const body = await req.json() as { topic?: string; guidance?: string };
    const result = await refineHunt({
      topic: body.topic || '',
      guidance: body.guidance || '',
    });

    return jsonResponse(result, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to refine Hunt';
    return errorResponse(message, 400, req);
  }
}
