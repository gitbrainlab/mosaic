import { AsyncWorkloadsClient } from '@netlify/async-workloads';
import type { HuntJobEventName } from '../../../src/types/hunt';
import type { StudioEnrichmentRequest } from '../../../src/types/studio-review';
import { runHuntWorkloadEvent } from './hunt-workload-runner';
import { runStudioEnrichmentJob } from './studio-enrichment-runner';

export interface HuntWorkloadPayload {
  huntId: string;
  jobId: string;
  instruction?: string;
  promotionId?: string;
}

export async function emitHuntWorkload(eventName: HuntJobEventName, payload: HuntWorkloadPayload) {
  if (process.env.MOSAIC_LOCAL_HUNT_SERVICE === '1') {
    void runHuntWorkloadEvent(eventName, payload, 0).catch(err => {
      const message = err instanceof Error ? err.message : 'Local Hunt workload failed';
      console.error(`[mosaic] ${message}`);
    });
    return { sendStatus: 'succeeded', local: true };
  }

  const client = new AsyncWorkloadsClient();
  const result = await client.send(eventName, { data: payload });
  if (result.sendStatus !== 'succeeded') {
    throw new Error(`Async Workload enqueue failed for ${eventName}.`);
  }
  return result;
}

export type StudioWorkloadEventName =
  | 'studio.enrich_photos'
  | 'studio.enrich_evidence'
  | 'studio.verify_location'
  | 'studio.refine_profile';

export interface StudioWorkloadPayload {
  jobId: string;
  request: StudioEnrichmentRequest;
}

export async function emitStudioWorkload(eventName: StudioWorkloadEventName, payload: StudioWorkloadPayload) {
  if (process.env.MOSAIC_LOCAL_HUNT_SERVICE === '1') {
    void runStudioEnrichmentJob(payload.jobId, payload.request, 0).catch(err => {
      const message = err instanceof Error ? err.message : 'Local Studio workload failed';
      console.error(`[mosaic] ${message}`);
    });
    return { sendStatus: 'succeeded', local: true };
  }

  const client = new AsyncWorkloadsClient();
  const result = await client.send(eventName, { data: payload });
  if (result.sendStatus !== 'succeeded') {
    throw new Error(`Async Workload enqueue failed for ${eventName}.`);
  }
  return result;
}
