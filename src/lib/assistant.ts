import type { HuntSpec, HuntState, PromotionRequest } from '../types/hunt';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const API_BASE = configuredApiBase || (import.meta.env.DEV ? 'http://localhost:8888/.netlify/functions' : '');

export class AssistantApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'AssistantApiError';
    this.status = status;
  }
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  if (!API_BASE) {
    throw new AssistantApiError('Mosaic Hunt API is not configured. Set VITE_API_BASE_URL to the Netlify Functions base URL.');
  }

  const res = await fetch(`${API_BASE}/${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
    const message = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`;
    throw new AssistantApiError(message, res.status);
  }

  return res.json() as Promise<T>;
}

export async function refineHunt(input: { topic: string; guidance?: string }): Promise<{ spec: HuntSpec; mode: string }> {
  return requestJson('hunt-refine', {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export async function createHunt(spec: HuntSpec): Promise<HuntState> {
  return requestJson('hunt-create', {
    method: 'POST',
    body: JSON.stringify({ spec }),
  });
}

export async function iterateHunt(huntId: string, instruction: string): Promise<HuntState> {
  return requestJson('hunt-iterate', {
    method: 'POST',
    body: JSON.stringify({ huntId, instruction }),
  });
}

export async function promoteHunt(huntId: string): Promise<{ promotion: PromotionRequest }> {
  return requestJson('hunt-promote', {
    method: 'POST',
    body: JSON.stringify({ huntId }),
  });
}
