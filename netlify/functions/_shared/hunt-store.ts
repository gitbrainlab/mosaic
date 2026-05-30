import type { DraftMap, HuntEvent, HuntProfile, HuntState, PromotionRequest } from '../../../src/types/hunt';

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
  return values.filter((value): value is T => Boolean(value));
}

export async function saveHuntState(state: HuntState): Promise<void> {
  await Promise.all([
    setJson('hunt-profiles', `hunt:${state.profile.id}`, state.profile),
    setJson('hunt-draft-maps', `hunt:${state.profile.id}`, state.draftMap),
    setJson('hunt-events', `hunt:${state.profile.id}`, state.events),
  ]);
}

export async function loadHuntState(huntId: string): Promise<HuntState | null> {
  const [profile, draftMap, events] = await Promise.all([
    getJson<HuntProfile>('hunt-profiles', `hunt:${huntId}`),
    getJson<DraftMap>('hunt-draft-maps', `hunt:${huntId}`),
    getJson<HuntEvent[]>('hunt-events', `hunt:${huntId}`),
  ]);

  if (!profile || !draftMap) return null;
  return { profile, draftMap, events: events || [] };
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
