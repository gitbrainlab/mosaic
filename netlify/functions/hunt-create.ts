import type { HuntProfile, HuntSpec, HuntState } from '../../src/types/hunt';
import { errorResponse, jsonResponse, optionsResponse } from './_shared/response';
import { eventFor, generateDraftMap } from './_shared/hunt-generation';
import { saveHuntState } from './_shared/hunt-store';

export default async function handler(req: Request): Promise<Response> {
  if (req.method === 'OPTIONS') return optionsResponse(req);
  if (req.method !== 'POST') return errorResponse('Method not allowed', 405, req);

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
      status: 'drafting',
      visibility: 'public',
      iterationCount: 0,
      maxIterations: 3,
      createdAt: timestamp,
      updatedAt: timestamp,
      ownerGithubLogin: req.headers.get('x-mosaic-user') || undefined,
    };

    const events = [
      eventFor(profile.id, 'created', 'Hunt profile created.'),
      eventFor(profile.id, 'drafting', 'Generating rapid provisional map.'),
    ];

    const { draftMap, mode } = await generateDraftMap(profile.spec, 0);
    const readyProfile = {
      ...profile,
      status: 'ready' as const,
      updatedAt: new Date().toISOString(),
    };

    const state: HuntState = {
      profile: readyProfile,
      draftMap,
      events: [
        ...events,
        eventFor(profile.id, 'ready', `Rapid draft map ready (${mode} mode).`),
      ],
    };

    await saveHuntState(state);
    return jsonResponse(state, 200, req);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create Hunt';
    return errorResponse(message, 500, req);
  }
}
