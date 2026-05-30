const DEFAULT_ALLOWED_ORIGIN = '*';

function corsHeaders(req?: Request): Record<string, string> {
  const configured = process.env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const origin = req?.headers.get('origin') || '';
  const allowed = configured.split(',').map(item => item.trim()).filter(Boolean);
  const allowOrigin = configured === '*' || allowed.includes('*') || allowed.includes(origin)
    ? (configured === '*' || allowed.includes('*') ? '*' : origin)
    : allowed[0] || DEFAULT_ALLOWED_ORIGIN;

  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Mosaic-User',
    'X-Content-Type-Options': 'nosniff',
  };
}

export function jsonResponse(body: unknown, status = 200, req?: Request): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
      ...corsHeaders(req),
    },
  });
}

export function errorResponse(message: string, status = 500, req?: Request): Response {
  return jsonResponse({ error: message }, status, req);
}

export function optionsResponse(req?: Request): Response {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}
