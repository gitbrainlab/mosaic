import type { HuntJob, HuntJobEventName, HuntState, PromotionRequest } from '../../../src/types/hunt';
import { dispatchPromotionWorkflow } from './github-client';
import { createId, eventFor, generateDraftMap } from './hunt-generation';
import {
  loadHuntJob,
  loadHuntState,
  loadPromotionRequest,
  saveHuntJob,
  saveHuntState,
  savePromotionRequest,
} from './hunt-store';
import type { HuntWorkloadPayload } from './workload-client';

export async function runHuntWorkloadEvent(eventName: HuntJobEventName, payload: HuntWorkloadPayload, attempt = 0) {
  const job = await loadHuntJob(payload.huntId, payload.jobId);
  if (!job) throw new Error(`Hunt job not found: ${payload.jobId}`);

  const runningJob: HuntJob = {
    ...job,
    status: 'running',
    attemptCount: Math.max(job.attemptCount, attempt + 1),
    startedAt: job.startedAt || new Date().toISOString(),
    lastError: undefined,
  };
  await saveHuntJob(runningJob);

  try {
    if (eventName === 'hunt.create') {
      await runCreateJob(payload, runningJob);
    } else if (eventName === 'hunt.iterate') {
      await runIterateJob(payload, runningJob);
    } else if (eventName === 'hunt.promote') {
      await runPromoteJob(payload, runningJob);
    } else {
      throw new Error(`Unsupported Hunt workload event: ${eventName}`);
    }
  } catch (err) {
    await failJob(payload, runningJob, err);
    throw err;
  }
}

async function runCreateJob(payload: HuntWorkloadPayload, job: HuntJob) {
  const state = await requireState(payload.huntId);
  const events = [
    ...state.events,
    eventFor(payload.huntId, 'running', 'Generating rapid provisional map.'),
  ];
  await saveHuntState({
    ...state,
    profile: {
      ...state.profile,
      status: 'running',
      updatedAt: new Date().toISOString(),
    },
    events,
  });

  const { draftMap, mode } = await generateDraftMap(state.profile.spec, 0);
  const readyState: HuntState = {
    ...state,
    profile: {
      ...state.profile,
      status: 'ready',
      updatedAt: new Date().toISOString(),
    },
    draftMap,
    events: [
      ...events,
      eventFor(payload.huntId, 'ready', `Rapid draft map ready (${mode} mode).`),
    ],
  };

  await Promise.all([
    saveHuntState(readyState),
    saveHuntJob({
      ...job,
      status: 'ready',
      completedAt: new Date().toISOString(),
      lastError: undefined,
    }),
  ]);
}

async function runIterateJob(payload: HuntWorkloadPayload, job: HuntJob) {
  const state = await requireState(payload.huntId);
  if (!state.draftMap) throw new Error('Cannot iterate before the first draft is ready.');

  const nextIteration = state.profile.iterationCount + 1;
  const events = [
    ...state.events,
    eventFor(payload.huntId, 'iterating', `Iteration ${nextIteration} running.`),
  ];
  await saveHuntState({
    ...state,
    profile: {
      ...state.profile,
      status: 'iterating',
      updatedAt: new Date().toISOString(),
    },
    events,
  });

  const { draftMap, mode } = await generateDraftMap(state.profile.spec, nextIteration, payload.instruction || '', state.draftMap);
  const readyState: HuntState = {
    ...state,
    profile: {
      ...state.profile,
      status: 'ready',
      iterationCount: nextIteration,
      updatedAt: new Date().toISOString(),
    },
    draftMap,
    events: [
      ...events,
      eventFor(payload.huntId, 'ready', `Iteration ${nextIteration} ready (${mode} mode).`),
    ],
  };

  await Promise.all([
    saveHuntState(readyState),
    saveHuntJob({
      ...job,
      status: 'ready',
      completedAt: new Date().toISOString(),
      lastError: undefined,
    }),
  ]);
}

async function runPromoteJob(payload: HuntWorkloadPayload, job: HuntJob) {
  const state = await requireState(payload.huntId);
  const promotion = await loadPromotionRequest(payload.huntId);
  if (!promotion || promotion.id !== payload.promotionId) throw new Error('Promotion request not found.');

  const { workflowUrl } = await dispatchPromotionWorkflow(promotion);
  const dispatchedPromotion: PromotionRequest = {
    ...promotion,
    status: 'workflow_dispatched',
    workflowUrl,
  };

  await Promise.all([
    savePromotionRequest(dispatchedPromotion),
    saveHuntState({
      ...state,
      profile: {
        ...state.profile,
        status: 'promotion_dispatched',
        promotion: dispatchedPromotion,
        updatedAt: new Date().toISOString(),
      },
      events: [
        ...state.events,
        eventFor(payload.huntId, 'promotion_dispatched', 'GitHub promotion workflow dispatched.'),
      ],
    }),
    saveHuntJob({
      ...job,
      status: 'promotion_dispatched',
      workflowUrl,
      completedAt: new Date().toISOString(),
      lastError: undefined,
    }),
  ]);
}

async function failJob(payload: HuntWorkloadPayload, job: HuntJob, err: unknown) {
  const message = err instanceof Error ? err.message : 'Hunt job failed';
  const state = await loadHuntState(payload.huntId);
  const failedAt = new Date().toISOString();

  await saveHuntJob({
    ...job,
    status: 'failed',
    completedAt: failedAt,
    lastError: message,
  });

  if (state) {
    await saveHuntState({
      ...state,
      profile: {
        ...state.profile,
        status: 'failed',
        updatedAt: failedAt,
      },
      events: [
        ...state.events,
        {
          ...eventFor(payload.huntId, 'failed', message, 'error'),
          severity: 'error',
          id: createId('evt', `${payload.huntId}-failed`),
        },
      ],
    });
  }
}

async function requireState(huntId: string): Promise<HuntState> {
  const state = await loadHuntState(huntId);
  if (!state) throw new Error(`Hunt not found: ${huntId}`);
  return state;
}
