import { errorResponse } from './response';

function bearerToken(value: string | null): string {
  if (!value) return '';
  const match = value.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || '';
}

export function requireHuntAccess(req: Request): Response | null {
  const expected = process.env.MOSAIC_HUNT_ACCESS_KEY || '';
  if (!expected) {
    return errorResponse('Mosaic Hunt access key is not configured.', 503, req);
  }

  const provided = req.headers.get('x-mosaic-hunt-key') || bearerToken(req.headers.get('authorization'));
  if (provided !== expected) {
    return errorResponse('Mosaic Hunt access key is required.', 401, req);
  }

  return null;
}

export function requireServiceToken(req: Request): Response | null {
  const expected = process.env.MOSAIC_NETLIFY_SERVICE_TOKEN || '';
  if (!expected) {
    return errorResponse('Mosaic Netlify service token is not configured.', 503, req);
  }

  const provided = req.headers.get('x-mosaic-service-token') || bearerToken(req.headers.get('authorization'));
  if (provided !== expected) {
    return errorResponse('Mosaic service token is required.', 401, req);
  }

  return null;
}
