#!/usr/bin/env tsx
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { requireHuntAccess, requireServiceToken } from '../netlify/functions/_shared/auth';
import { buildPromotionArtifact, inferTargetMapSlug } from '../netlify/functions/_shared/promotion-artifact';
import studioEnrichmentHandler from '../netlify/functions/studio-enrichment';
import type { DraftMap, HuntProfile } from '../src/types/hunt';
import type { StudioEnrichmentRequest } from '../src/types/studio-review';

const timestamp = '2026-05-30T00:00:00.000Z';

const profile: HuntProfile = {
  id: 'hunt-test',
  spec: {
    id: 'hunt-test',
    title: 'Hunt: Test Places',
    topic: 'Test Places',
    intent: 'Verify Hunt queue contracts.',
    scope: 'Contract test scope.',
    geography: { label: 'Albany, NY' },
    mustHaveConstraints: ['Exact address'],
    exclusions: ['Generic filler'],
    photoPolicy: 'Verified real location-tied photos only.',
    desiredScale: { initialEntries: 3, targetEntries: 10 },
    qualityTargets: ['quality gates'],
    createdAt: timestamp,
    updatedAt: timestamp,
  },
  status: 'ready',
  visibility: 'public',
  iterationCount: 0,
  maxIterations: 3,
  createdAt: timestamp,
  updatedAt: timestamp,
};

const draftMap: DraftMap = {
  id: 'draft-test',
  huntId: profile.id,
  title: 'Test Places',
  tagline: 'Provisional test draft',
  narrative: 'A test draft.',
  generatedAt: timestamp,
  iteration: 0,
  entries: [
    {
      id: 'test-entry',
      name: 'Test Entry',
      location: {
        address: '123 Test St',
        city: 'Albany',
        region: 'NY',
        country: 'USA',
        lat: 42.6526,
        lng: -73.7562,
      },
      summary: 'A provisional test entry.',
      confidence: 'medium',
      evidenceHints: ['Needs independent verification'],
      tags: ['test'],
      photoStatus: 'pending',
      provisionalReason: 'Contract test only.',
    },
  ],
  suppressedCandidates: [],
};

assert.equal(inferTargetMapSlug(profile), 'test-places');

const artifact = buildPromotionArtifact(profile, draftMap, 'test-places');
assert.equal(artifact.huntId, profile.id);
assert.equal(artifact.targetMapSlug, 'test-places');
assert.equal(artifact.approvedEntries.length, 1);
assert.equal(artifact.approvedEntries[0]?.location.address, '123 Test St');
assert.equal(artifact.approvedEntries[0]?.photos?.length, 0);

delete process.env.MOSAIC_HUNT_ACCESS_KEY;
assert.equal(requireHuntAccess(new Request('https://example.com'))?.status, 503);

process.env.MOSAIC_HUNT_ACCESS_KEY = 'secret';
assert.equal(requireHuntAccess(new Request('https://example.com'))?.status, 401);
assert.equal(requireHuntAccess(new Request('https://example.com', { headers: { 'X-Mosaic-Hunt-Key': 'secret' } })), null);

const enrichmentPayload: StudioEnrichmentRequest = {
  actionType: 'enrich_photos',
  mapSlug: 'test-places',
  mapTitle: 'Test Places',
  entryId: 'test-entry',
  entryName: 'Test Entry',
  issues: ['missing_product_photos'],
  entry: {
    id: 'test-entry',
    name: 'Test Entry',
    location: {
      address: '123 Test St',
      city: 'Albany',
      region: 'NY',
      country: 'USA',
      lat: 42.6526,
      lng: -73.7562,
    },
    description: 'Test entry with a photo gap.',
    confidence: 'medium',
    evidence: [],
    tags: ['test'],
  },
};

const missingKeyResponse = await studioEnrichmentHandler(new Request('https://example.com/.netlify/functions/studio-enrichment', {
  method: 'POST',
  body: JSON.stringify(enrichmentPayload),
}));
assert.equal(missingKeyResponse.status, 401);

process.env.MOCK_HUNT_MODE = 'true';
const queuedEnrichmentResponse = await studioEnrichmentHandler(new Request('https://example.com/.netlify/functions/studio-enrichment', {
  method: 'POST',
  headers: { 'X-Mosaic-Hunt-Key': 'secret', 'Content-Type': 'application/json' },
  body: JSON.stringify(enrichmentPayload),
}));
assert.equal(queuedEnrichmentResponse.status, 200);
const queuedEnrichment = await queuedEnrichmentResponse.json() as { job: { status: string; jobId: string; result?: { mode: string } } };
assert.equal(queuedEnrichment.job.status, 'ready');
assert.equal(queuedEnrichment.job.result?.mode, 'fallback');

const jobReadResponse = await studioEnrichmentHandler(new Request(`https://example.com/.netlify/functions/studio-enrichment?jobId=${queuedEnrichment.job.jobId}`));
assert.equal(jobReadResponse.status, 200);
delete process.env.MOCK_HUNT_MODE;

delete process.env.MOSAIC_NETLIFY_SERVICE_TOKEN;
assert.equal(requireServiceToken(new Request('https://example.com'))?.status, 503);
process.env.MOSAIC_NETLIFY_SERVICE_TOKEN = 'service-secret';
assert.equal(requireServiceToken(new Request('https://example.com', { headers: { Authorization: 'Bearer service-secret' } })), null);

assert.equal(existsSync(new URL('../netlify/functions/async-workloads-router.ts', import.meta.url)), true);
assert.equal(existsSync(new URL('../netlify/functions/studio-review-action.ts', import.meta.url)), true);

console.log('Hunt queue contract verified.');
