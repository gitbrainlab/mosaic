import type { DraftMap, HuntEvent, HuntJob, HuntProfile, HuntState, PromotionRequest } from '../../../src/types/hunt';
import type { StudioEnrichmentJob, StudioReviewActionRecord } from '../../../src/types/studio-review';

const memory = new Map<string, unknown>();

async function getStore(name: string) {
  try {
    const blobs = await import('@netlify/blobs');
    return blobs.getStore(name);
  } catch {
    return null;
  }
}

function memoryKey(store: string, key: string) {
  return `${store}:${key}`;
}

async function getJson<T>(storeName: string, key: string): Promise<T | null> {
  const store = await getStore(storeName);
  if (!store) return (memory.get(memoryKey(storeName, key)) as T | undefined) || null;
  return await store.get(key, { type: 'json' }) as T | null;
}

async function setJson(storeName: string, key: string, value: unknown): Promise<void> {
  const store = await getStore(storeName);
  if (!store) {
    memory.set(memoryKey(storeName, key), value);
    return;
  }
  await store.setJSON(key, value);
}

async function listJson<T>(storeName: string, prefix: string): Promise<T[]> {
  const store = await getStore(storeName);
  if (!store) {
    return Array.from(memory.entries())
      .filter(([key]) => key.startsWith(memoryKey(storeName, prefix)))
      .map(([, value]) => value as T);
  }

  const listed = await store.list({ prefix });
  const values = await Promise.all(
    listed.blobs.map(blob => store.get(blob.key, { type: 'json' }) as Promise<T | null>),
  );
  return values.filter((value): value is NonNullable<typeof value> => Boolean(value)) as T[];
}

export async function saveHuntState(state: HuntState): Promise<void> {
  await Promise.all([
    setJson('hunt-profiles', `hunt:${state.profile.id}`, state.profile),
    setJson('hunt-draft-maps', `hunt:${state.profile.id}`, state.draftMap),
    setJson('hunt-events', `hunt:${state.profile.id}`, state.events),
  ]);
}

export async function loadHuntState(huntId: string): Promise<HuntState | null> {
  const [profile, draftMap, events, jobs] = await Promise.all([
    getJson<HuntProfile>('hunt-profiles', `hunt:${huntId}`),
    getJson<DraftMap>('hunt-draft-maps', `hunt:${huntId}`),
    getJson<HuntEvent[]>('hunt-events', `hunt:${huntId}`),
    listHuntJobs(huntId),
  ]);

  if (!profile) return null;
  return { profile, draftMap, events: events || [], jobs };
}

export async function listHunts(): Promise<Array<{ profile: HuntProfile; draftMap: DraftMap | null }>> {
  const profiles = await listJson<HuntProfile>('hunt-profiles', 'hunt:');
  const rows = await Promise.all(profiles.map(async profile => ({
    profile,
    draftMap: await getJson<DraftMap>('hunt-draft-maps', `hunt:${profile.id}`),
  })));

  return rows.sort((a, b) => b.profile.updatedAt.localeCompare(a.profile.updatedAt));
}

export async function savePromotionRequest(promotion: PromotionRequest): Promise<void> {
  await setJson('hunt-promotions', `hunt:${promotion.huntId}`, promotion);
}

export async function loadPromotionRequest(huntId: string): Promise<PromotionRequest | null> {
  return await getJson<PromotionRequest>('hunt-promotions', `hunt:${huntId}`);
}

export async function saveHuntJob(job: HuntJob): Promise<void> {
  await setJson('hunt-jobs', `job:${job.huntId}:${job.jobId}`, job);
}

export async function loadHuntJob(huntId: string, jobId: string): Promise<HuntJob | null> {
  return await getJson<HuntJob>('hunt-jobs', `job:${huntId}:${jobId}`);
}

export async function listHuntJobs(huntId: string): Promise<HuntJob[]> {
  const jobs = await listJson<HuntJob>('hunt-jobs', `job:${huntId}:`);
  return jobs.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function savePromotionArtifact(promotionId: string, artifact: unknown): Promise<string> {
  const key = `promotion:${promotionId}`;
  await setJson('hunt-promotions', key, artifact);
  return key;
}

export async function loadPromotionArtifact(promotionId: string): Promise<unknown | null> {
  return await getJson<unknown>('hunt-promotions', `promotion:${promotionId}`);
}

export async function saveStudioReviewAction(action: StudioReviewActionRecord): Promise<void> {
  await setJson('studio-review-actions', `action:${action.mapSlug}:${action.entryId}:${action.id}`, action);
}

export async function saveStudioEnrichmentJob(job: StudioEnrichmentJob): Promise<void> {
  await setJson('studio-enrichment-jobs', `job:${job.jobId}`, job);
  await setJson('studio-enrichment-jobs', `entry:${job.mapSlug}:${job.entryId}:${job.jobId}`, job);
}

export async function loadStudioEnrichmentJob(jobId: string): Promise<StudioEnrichmentJob | null> {
  return await getJson<StudioEnrichmentJob>('studio-enrichment-jobs', `job:${jobId}`);
}

export async function listStudioEnrichmentJobsForEntry(mapSlug: string, entryId: string): Promise<StudioEnrichmentJob[]> {
  const jobs = await listJson<StudioEnrichmentJob>('studio-enrichment-jobs', `entry:${mapSlug}:${entryId}:`);
  return jobs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
