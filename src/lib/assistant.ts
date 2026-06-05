import type { HuntSpec, HuntState, PromotionRequest } from '../types/hunt';
import type {
  StudioEnrichmentJob,
  StudioEnrichmentRequest,
  StudioReviewActionPayload,
  StudioReviewActionRecord,
} from '../types/studio-review';

const configuredApiBase = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, '');
const localApiBases = [
  `${window.location.origin}/.netlify/functions`,
  'http://127.0.0.1:8888/.netlify/functions',
  'http://localhost:8888/.netlify/functions',
];
const API_BASES = resolveApiBases(configuredApiBase);

export class AssistantApiError extends Error {
  readonly status: number;

  constructor(message: string, status = 0) {
    super(message);
    this.name = 'AssistantApiError';
    this.status = status;
  }
}

function resolveApiBases(configuredBase?: string): string[] {
  const isLocalDevHost = /^(localhost|127\.0\.0\.1|::1)$/.test(window.location.hostname);
  if (!configuredBase) return localApiBases;
  if (isLocalDevHost) {
    const ordered = [...localApiBases];
    if (!ordered.includes(configuredBase)) ordered.push(configuredBase);
    return ordered;
  }
  return [configuredBase];
}

interface RequestJsonOptions {
  requiresAccessKey?: boolean;
}

let activeHuntKeyPrompt: Promise<string> | null = null;

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

async function getHuntAccessKey(): Promise<string> {
  const stored = readStoredHuntKey();
  if (stored) return stored;

  if (!activeHuntKeyPrompt) {
    activeHuntKeyPrompt = promptForHuntAccessKey().finally(() => {
      activeHuntKeyPrompt = null;
    });
  }

  const prompted = (await activeHuntKeyPrompt).trim();
  if (prompted) writeStoredHuntKey(prompted);
  return prompted;
}

async function requestJson<T>(path: string, init?: RequestInit, options: RequestJsonOptions = {}): Promise<T> {
  if (API_BASES.length === 0) {
    throw new AssistantApiError('Mosaic Hunt API is not configured. Set VITE_API_BASE_URL to the Netlify Functions base URL.');
  }

  const performRequest = async (base: string): Promise<Response> => {
    const accessKey = options.requiresAccessKey ? await getHuntAccessKey() : '';
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
      if (res.status === 401 && options.requiresAccessKey) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        const message = typeof body?.error === 'string' ? body.error : 'Mosaic Hunt access key is required.';
        throw new AssistantApiError(message, 401);
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
    if (err instanceof AssistantApiError && err.status === 401) {
      throw err;
    }
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

function promptForHuntAccessKey(): Promise<string> {
  return new Promise(resolve => {
    const existing = document.getElementById('mosaic-hunt-key-dialog');
    if (existing) existing.remove();

    const stored = readStoredHuntKey();
    const overlay = document.createElement('div');
    overlay.id = 'mosaic-hunt-key-dialog';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.className = 'fixed inset-0 z-[1000] flex items-center justify-center bg-black/70 px-4';

    const panel = document.createElement('div');
    panel.className = 'w-full max-w-md rounded-2xl border border-[#c9a86c]/60 bg-[#111111] p-4 text-[#f4f1e9] shadow-2xl';
    panel.innerHTML = `
      <div class="text-[10px] uppercase tracking-[1.5px] font-bold text-[#c9a86c]">Curator key</div>
      <h2 class="mt-1 text-lg font-semibold">Enter the shared key</h2>
      <p class="mt-2 text-sm leading-relaxed text-[#b8b2a8]">This unlocks Hunts, Studio submissions, and live enrichment. You can replace or clear the saved key here.</p>
      <label class="mt-4 block text-xs uppercase tracking-[1px] font-bold text-[#a1a1aa]" for="mosaic-hunt-key-input">Curator key</label>
      <input id="mosaic-hunt-key-input" type="password" autocomplete="off" spellcheck="false" value="${escapeHtml(stored)}" class="mt-2 w-full rounded-xl border border-[#3f3b33] bg-[#0f0f11] px-3 py-3 text-sm text-[#f4f1e9] outline-none focus:border-[#c9a86c]" placeholder="Enter curator key" />
      <div class="mt-3 flex flex-wrap gap-2">
        <button type="button" data-save class="min-h-11 rounded-xl bg-[#c9a86c] px-4 text-sm font-semibold text-[#0f0f11]">Use key</button>
        <button type="button" data-clear class="min-h-11 rounded-xl border border-[#3f3b33] px-4 text-sm font-semibold text-[#f4f1e9]">Clear saved key</button>
        <button type="button" data-cancel class="min-h-11 rounded-xl border border-[#3f3b33] px-4 text-sm font-semibold text-[#f4f1e9]">Cancel</button>
      </div>
      <div class="mt-3 text-xs text-[#a1a1aa]">Press Enter to use the key, Escape to cancel.</div>
    `;

    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const input = panel.querySelector<HTMLInputElement>('#mosaic-hunt-key-input');
    const save = panel.querySelector<HTMLButtonElement>('[data-save]');
    const clear = panel.querySelector<HTMLButtonElement>('[data-clear]');
    const cancel = panel.querySelector<HTMLButtonElement>('[data-cancel]');
    const cleanup = () => {
      overlay.removeEventListener('keydown', onKeydown);
      overlay.remove();
    };
    const finish = (value: string) => {
      cleanup();
      resolve(value);
    };
    const onKeydown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        finish('');
      }
      if (event.key === 'Enter' && event.target === input) {
        event.preventDefault();
        finish(input?.value || '');
      }
    };

    save?.addEventListener('click', () => finish(input?.value || ''));
    clear?.addEventListener('click', () => {
      clearStoredHuntKey();
      if (input) {
        input.value = '';
        input.focus();
        input.setSelectionRange(0, 0);
      }
    });
    cancel?.addEventListener('click', () => finish(''));
    overlay.addEventListener('click', event => {
      if (event.target === overlay) finish('');
    });
    overlay.addEventListener('keydown', onKeydown);
    setTimeout(() => input?.focus(), 0);
  });
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
