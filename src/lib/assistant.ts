import type { HuntSpec, HuntState, PromotionRequest } from '../types/hunt';
import type {
  StudioEnrichmentJob,
  StudioEnrichmentRequest,
  StudioReviewActionPayload,
  StudioReviewActionRecord,
} from '../types/studio-review';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const API_BASES = configuredApiBase
  ? [configuredApiBase]
  : [
      `${window.location.origin}/.netlify/functions`,
      'http://127.0.0.1:8888/.netlify/functions',
      'http://localhost:8888/.netlify/functions',
    ];

export class AssistantApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'AssistantApiError';
    this.status = status;
  }
}

interface RequestJsonOptions {
  requiresAccessKey?: boolean;
}

function readStoredHuntKey(): string {
  try {
    return localStorage.getItem('mosaic:huntAccessKey') || '';
  } catch {
    return '';
  }
}

function writeStoredHuntKey(value: string) {
  try {
    localStorage.setItem('mosaic:huntAccessKey', value);
  } catch {
    // Storage can be unavailable in private/browser-restricted contexts.
  }
}

export function clearStoredHuntKey() {
  try {
    localStorage.removeItem('mosaic:huntAccessKey');
  } catch {
    // Ignore storage failures.
  }
}

function getHuntAccessKey(): string {
  const stored = readStoredHuntKey();
  if (stored) return stored;

  const prompted = window.prompt('Enter curator key to start Hunts, submit Studio actions, or run live enrichment.')?.trim() || '';
  if (prompted) writeStoredHuntKey(prompted);
  return prompted;
}

async function requestJson<T>(path: string, init?: RequestInit, options: RequestJsonOptions = {}): Promise<T> {
  if (API_BASES.length === 0) {
    throw new AssistantApiError('Mosaic Hunt API is not configured. Set VITE_API_BASE_URL to the Netlify Functions base URL.');
  }

  let retriedAccessKey = false;
  const performRequest = async (base: string): Promise<Response> => {
    const accessKey = options.requiresAccessKey ? getHuntAccessKey() : '';
    if (options.requiresAccessKey && !accessKey) {
      throw new AssistantApiError('Mosaic Hunt access key is required.', 401);
    }

    return fetch(`${base}/${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...(accessKey ? { 'X-Mosaic-Hunt-Key': accessKey } : {}),
        ...(init?.headers || {}),
      },
    });
  };

  let lastError: unknown = null;
  for (const base of API_BASES) {
    try {
      let res = await performRequest(base);
      if (res.status === 404 || res.status === 405) {
        lastError = new AssistantApiError(`HTTP ${res.status}`, res.status);
        continue;
      }
      if (res.status === 401 && options.requiresAccessKey && !retriedAccessKey) {
        retriedAccessKey = true;
        clearStoredHuntKey();
        res = await performRequest(base);
      }

      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const message = typeof body?.error === 'string' ? body.error : `HTTP ${res.status}`;
        throw new AssistantApiError(message, res.status);
      }

      return res.json() as Promise<T>;
    } catch (err) {
      lastError = err;
    }
  }

  throw (lastError instanceof Error ? lastError : new AssistantApiError('Mosaic Hunt service is unavailable.'));
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
  }, { requiresAccessKey: true });
}

export async function iterateHunt(huntId: string, instruction: string): Promise<HuntState> {
  return requestJson('hunt-iterate', {
    method: 'POST',
    body: JSON.stringify({ huntId, instruction }),
  }, { requiresAccessKey: true });
}

export async function promoteHunt(huntId: string): Promise<{ promotion: PromotionRequest; state?: HuntState }> {
  return requestJson('hunt-promote', {
    method: 'POST',
    body: JSON.stringify({ huntId }),
  }, { requiresAccessKey: true });
}

export async function submitStudioReviewAction(action: StudioReviewActionPayload): Promise<{ actionId: string; status: string; action: StudioReviewActionRecord }> {
  try {
    return await requestJson('studio-review-action', {
      method: 'POST',
      body: JSON.stringify({ action }),
    }, { requiresAccessKey: true });
  } catch (err) {
    const record = persistLocalStudioReviewAction(action);
    return {
      actionId: record.id,
      status: record.status,
      action: record,
    };
  }
}

export async function requestStudioEnrichment(input: StudioEnrichmentRequest): Promise<{ job: StudioEnrichmentJob }> {
  return requestJson('studio-enrichment', {
    method: 'POST',
    body: JSON.stringify(input),
  }, { requiresAccessKey: true });
}

export async function getStudioEnrichmentJob(jobId: string): Promise<{ job: StudioEnrichmentJob }> {
  return requestJson(`studio-enrichment?jobId=${encodeURIComponent(jobId)}`);
}

function persistLocalStudioReviewAction(action: StudioReviewActionPayload): StudioReviewActionRecord {
  const submittedAt = new Date().toISOString();
  const record: StudioReviewActionRecord = {
    ...action,
    id: `local-review-${Date.now().toString(36)}`,
    status: 'submitted',
    submittedAt,
    submittedBy: 'local-fallback',
  };

  try {
    const existing = JSON.parse(localStorage.getItem('mosaic:studioReviewActions') || '[]') as StudioReviewActionRecord[];
    localStorage.setItem('mosaic:studioReviewActions', JSON.stringify([...existing.slice(-24), record]));
  } catch {
    // Ignore local storage failures.
  }

  return record;
}
