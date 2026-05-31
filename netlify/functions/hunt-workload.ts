import { asyncWorkloadFn } from '@netlify/async-workloads';
import type { AsyncWorkloadConfig, CustomAsyncWorkloadEvent } from '@netlify/async-workloads';
import type { HuntJobEventName } from '../../src/types/hunt';
import { runHuntWorkloadEvent } from './_shared/hunt-workload-runner';
import { runStudioEnrichmentJob } from './_shared/studio-enrichment-runner';
import type { HuntWorkloadPayload, StudioWorkloadEventName, StudioWorkloadPayload } from './_shared/workload-client';

type HuntWorkloadEvent = CustomAsyncWorkloadEvent & {
  eventName: HuntJobEventName | StudioWorkloadEventName;
  eventData: HuntWorkloadPayload | StudioWorkloadPayload;
};

export default asyncWorkloadFn<HuntWorkloadEvent>(async event => {
  if (event.eventName.startsWith('studio.')) {
    const payload = event.eventData as StudioWorkloadPayload;
    await runStudioEnrichmentJob(payload.jobId, payload.request, event.attempt);
    return;
  }

  await runHuntWorkloadEvent(event.eventName as HuntJobEventName, event.eventData as HuntWorkloadPayload, event.attempt);
});

export const asyncWorkloadConfig: AsyncWorkloadConfig<HuntWorkloadEvent> = {
  events: [
    'hunt.create',
    'hunt.iterate',
    'hunt.promote',
    'studio.enrich_photos',
    'studio.enrich_evidence',
    'studio.verify_location',
    'studio.refine_profile',
  ],
  maxRetries: 2,
  backoffSchedule: attempt => (attempt < 1 ? '2 minutes' : '10 minutes'),
};
