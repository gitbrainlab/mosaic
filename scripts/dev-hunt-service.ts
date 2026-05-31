import http from 'node:http';
import { Buffer } from 'node:buffer';
import { existsSync, readFileSync } from 'node:fs';

process.env.MOSAIC_LOCAL_HUNT_SERVICE ||= '1';
process.env.MOSAIC_HUNT_ACCESS_KEY ||= 'iceicebaby';
process.env.MOSAIC_NETLIFY_SERVICE_TOKEN ||= 'local-service-token';
process.env.MOSAIC_NETLIFY_BASE_URL ||= 'http://127.0.0.1:8888';
process.env.ALLOWED_ORIGIN ||= 'http://127.0.0.1:5173,http://localhost:5173';

if (!process.env.XAI_API_KEY && !process.env.XAI_KEY && existsSync('.xai-key')) {
  process.env.XAI_API_KEY = readFileSync('.xai-key', 'utf8').trim();
}

type HandlerModule = { default: (req: Request) => Promise<Response> };

const PORT = Number.parseInt(process.env.PORT || '8888', 10);
const BASE_URL = `http://127.0.0.1:${PORT}`;

const ROUTES: Record<string, () => Promise<HandlerModule>> = {
  health: () => import('../netlify/functions/health.ts'),
  'hunt-create': () => import('../netlify/functions/hunt-create.ts'),
  'hunt-status': () => import('../netlify/functions/hunt-status.ts'),
  'hunt-list': () => import('../netlify/functions/hunt-list.ts'),
  'hunt-iterate': () => import('../netlify/functions/hunt-iterate.ts'),
  'hunt-promote': () => import('../netlify/functions/hunt-promote.ts'),
  'hunt-refine': () => import('../netlify/functions/hunt-refine.ts'),
  'studio-review-action': () => import('../netlify/functions/studio-review-action.ts'),
  'studio-enrichment': () => import('../netlify/functions/studio-enrichment.ts'),
  'hunt-promotion-export': () => import('../netlify/functions/hunt-promotion-export.ts'),
  'hunt-promotion-callback': () => import('../netlify/functions/hunt-promotion-callback.ts'),
};

const server = http.createServer(async (incoming, outgoing) => {
  try {
    const url = new URL(incoming.url || '/', BASE_URL);
    if (!url.pathname.startsWith('/.netlify/functions/')) {
      writeJson(outgoing, 404, { error: 'Not found' });
      return;
    }

    const functionName = decodeURIComponent(url.pathname.replace('/.netlify/functions/', ''));
    const loader = ROUTES[functionName];
    if (!loader) {
      writeJson(outgoing, 404, { error: `Unknown function: ${functionName}` });
      return;
    }

    const body = await readBody(incoming);
    const headers = new Headers();
    for (const [key, value] of Object.entries(incoming.headers)) {
      if (Array.isArray(value)) {
        for (const item of value) headers.append(key, item);
      } else if (typeof value === 'string') {
        headers.set(key, value);
      }
    }
    headers.set('host', incoming.headers.host || `127.0.0.1:${PORT}`);
    headers.set('x-forwarded-host', incoming.headers.host || `127.0.0.1:${PORT}`);
    headers.set('x-forwarded-proto', 'http');

    const init: RequestInit = {
      method: incoming.method || 'GET',
      headers,
      body: body.length > 0 && !['GET', 'HEAD'].includes(incoming.method || 'GET') ? body : undefined,
    };

    const request = new Request(url.toString(), init);
    const handler = (await loader()).default;
    const response = await handler(request);
    await writeResponse(outgoing, response);
  } catch (err) {
    const message = err instanceof Error ? err.stack || err.message : 'Local hunt service error';
    console.error(message);
    writeJson(outgoing, 500, { error: 'Local hunt service error', detail: err instanceof Error ? err.message : String(err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[mosaic] local hunt service running at ${BASE_URL}/.netlify/functions`);
});

async function readBody(req: http.IncomingMessage): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

async function writeResponse(res: http.ServerResponse, response: Response): Promise<void> {
  const headers = Object.fromEntries(response.headers.entries());
  if (!('content-type' in headers) && response.headers.get('content-type')) {
    headers['content-type'] = response.headers.get('content-type') as string;
  }
  res.writeHead(response.status, headers);
  if (!response.body) {
    res.end();
    return;
  }
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function writeJson(res: http.ServerResponse, status: number, payload: unknown): void {
  const body = Buffer.from(JSON.stringify(payload));
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}
