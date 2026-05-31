import type { HuntJob, HuntProfile, HuntSpec, HuntState } from '../../src/types/hunt';
import { requireHuntAccess } from './_shared/auth';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { createId, eventFor } from './_shared/hunt-generation';
import { saveHuntJob, saveHuntState } from './_shared/hunt-store';
import { emitHuntWorkload } from './_shared/workload-client';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);
  const authError = requireHuntAccess(req);
  if (authError) return authError;

  try {
    const body = await req.json() as { spec?: HuntSpec };
    if (!body.spec?.id || !body.spec.title) return errorResponse('spec is required', 400, req);

    const timestamp = new Date().toISOString();
    const profile: HuntProfile = {
      id: body.spec.id,
      spec: {
        ...body.spec,
        updatedAt: timestamp,
      },
      status: 'queued',
      visibility: 'public',
      iterationCount: 0,
      maxIterations: 3,
      createdAt: timestamp,
      updatedAt: timestamp,
      ownerGithubLogin: req.headers.get('x-mosaic-user') || undefined,
    };

    const events = [
      eventFor(profile.id, 'created', 'Hunt profile created.'),
      eventFor(profile.id, 'queued', 'Hunt draft job queued.'),
    ];

    const job: HuntJob = {
      jobId: createId('job', profile.id),
      huntId: profile.id,
      kind: 'create',
      eventName: 'hunt.create',
      status: 'queued',
      attemptCount: 0,
      createdAt: timestamp,
    };

    const state: HuntState = {
      profile,
      draftMap: null,
      events,
      jobs: [job],
    };

    await Promise.all([
      saveHuntState(state),
      saveHuntJob(job),
    ]);
    await emitHuntWorkload('hunt.create', { huntId: profile.id, jobId: job.jobId });
    return jsonResponse(state, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Hunt';
    return errorResponse(message, 500, req);
  }
}
