import type { HuntJob } from '../../src/types/hunt';
import { requireHuntAccess } from './_shared/auth';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { createId, eventFor } from './_shared/hunt-generation';
import { loadHuntState, saveHuntJob, saveHuntState } from './_shared/hunt-store';
import { emitHuntWorkload } from './_shared/workload-client';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);
  const authError = requireHuntAccess(req);
  if (authError) return authError;

  try {
    const body = await req.json() as { huntId?: string; instruction?: string };
    if (!body.huntId) return errorResponse('huntId is required', 400, req);

    const state = await loadHuntState(body.huntId);
    if (!state) return errorResponse('Hunt not found', 404, req);
    if (!state.draftMap) return errorResponse('First draft is not ready yet.', 409, req);
    if (state.profile.iterationCount >= state.profile.maxIterations) {
      return errorResponse('Iteration cap reached. Promote the Hunt for deeper GitHub research.', 409, req);
    }

    const nextIteration = state.profile.iterationCount + 1;
    const timestamp = new Date().toISOString();
    const job: HuntJob = {
      jobId: createId('job', `${state.profile.id}-iterate-${nextIteration}`),
      huntId: state.profile.id,
      kind: 'iterate',
      eventName: 'hunt.iterate',
      status: 'queued',
      attemptCount: 0,
      createdAt: timestamp,
    };
    const nextState = {
      profile: {
        ...state.profile,
        status: 'queued' as const,
        updatedAt: timestamp,
      },
      draftMap: state.draftMap,
      events: [
        ...state.events,
        eventFor(state.profile.id, 'queued', `Iteration ${nextIteration} job queued.`),
      ],
      jobs: [...(state.jobs || []), job],
    };

    await Promise.all([
      saveHuntState(nextState),
      saveHuntJob(job),
    ]);
    await emitHuntWorkload('hunt.iterate', { huntId: state.profile.id, jobId: job.jobId, instruction: body.instruction || '' });
    return jsonResponse(nextState, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to iterate Hunt';
    return errorResponse(message, 500, req);
  }
}
