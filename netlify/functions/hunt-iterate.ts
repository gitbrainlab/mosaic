import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { eventFor, generateDraftMap } from './_shared/hunt-generation';
import { loadHuntState, saveHuntState } from './_shared/hunt-store';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

  try {
    const body = await req.json() as { huntId?: string; instruction?: string };
    if (!body.huntId) return errorResponse('huntId is required', 400, req);

    const state = await loadHuntState(body.huntId);
    if (!state) return errorResponse('Hunt not found', 404, req);
    if (state.profile.iterationCount >= state.profile.maxIterations) {
      return errorResponse('Iteration cap reached. Promote the Hunt for deeper GitHub research.', 409, req);
    }

    const nextIteration = state.profile.iterationCount + 1;
    const { draftMap, mode } = await generateDraftMap(state.profile.spec, nextIteration, body.instruction || '');
    const nextState = {
      profile: {
        ...state.profile,
        status: 'ready' as const,
        iterationCount: nextIteration,
        updatedAt: new Date().toISOString(),
      },
      draftMap,
      events: [
        ...state.events,
        eventFor(state.profile.id, 'iterating', `Iteration ${nextIteration} requested.`),
        eventFor(state.profile.id, 'ready', `Iteration ${nextIteration} ready (${mode} mode).`),
      ],
    };

    await saveHuntState(nextState);
    return jsonResponse(nextState, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to iterate Hunt';
    return errorResponse(message, 500, req);
  }
}
