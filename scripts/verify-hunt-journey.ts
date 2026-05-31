#!/usr/bin/env tsx
import assert from 'node:assert/strict';
import huntCreateHandler from '../netlify/functions/hunt-create';
import huntIterateHandler from '../netlify/functions/hunt-iterate';
import huntPromoteHandler from '../netlify/functions/hunt-promote';
import huntRefineHandler from '../netlify/functions/hunt-refine';
import huntStatusHandler from '../netlify/functions/hunt-status';
import promotionExportHandler from '../netlify/functions/hunt-promotion-export';
import studioReviewActionHandler from '../netlify/functions/studio-review-action';
import { loadHuntState } from '../netlify/functions/_shared/hunt-store';
import type { HuntSpec, HuntState } from '../src/types/hunt';
import type { StudioReviewActionRecord } from '../src/types/studio-review';

process.env.MOSAIC_LOCAL_HUNT_SERVICE = '1';
process.env.MOSAIC_HUNT_ACCESS_KEY = 'journey-secret';
process.env.MOSAIC_NETLIFY_SERVICE_TOKEN = 'journey-service-secret';
process.env.XAI_API_KEY = 'journey-test-key';
delete process.env.MOCK_HUNT_MODE;

const originalFetch = globalThis.fetch;
globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (!url.startsWith('https://api.x.ai/')) {
    return originalFetch(input, init);
  }

  const body = JSON.parse(String(init?.body || '{}')) as {
    messages?: Array<{ role: string; content: string }>;
  };
  const system = body.messages?.[0]?.content || '';
  const user = body.messages?.at(-1)?.content || '';
  const content = system.includes('refine Mosaic Hunt')
    ? refinedSpecContent()
    : draftMapContent(user.includes('"iteration": 1') ? 1 : 0);

  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) } }],
  }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

try {
  const refineResponse = await huntRefineHandler(jsonRequest('hunt-refine', {
    topic: 'Pistachio ice cream in Albany',
    guidance: 'Capital District only, exact addresses, no generic chains.',
  }));
  assert.equal(refineResponse.status, 200);
  const refined = await refineResponse.json() as { spec: HuntSpec; mode: string };
  assert.equal(refined.mode, 'live');
  assert.equal(refined.spec.title, 'Pistachio Ice Cream in Albany');

  const huntId = `hunt-journey-${Date.now().toString(36)}`;
  const spec: HuntSpec = {
    ...refined.spec,
    id: huntId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createResponse = await huntCreateHandler(jsonRequest('hunt-create', { spec }, true));
  assert.equal(createResponse.status, 200);
  const created = await createResponse.json() as HuntState;
  assert.equal(created.profile.status, 'queued');
  assert.equal(created.draftMap, null);

  const ready = await waitForHunt(huntId, state => state.profile.status === 'ready');
  assert.equal(ready.profile.status, 'ready');
  assert.ok(ready.draftMap);
  assert.ok(ready.draftMap.entries.length >= 2);
  for (const entry of ready.draftMap.entries) {
    assert.doesNotMatch(entry.name, /candidate|placeholder|test entry|draft place/i);
    assert.notEqual(entry.location.address, 'Address pending verification');
    assert.ok(Number.isFinite(entry.location.lat));
    assert.ok(Number.isFinite(entry.location.lng));
  }

  const iterateResponse = await huntIterateHandler(jsonRequest('hunt-iterate', {
    huntId,
    instruction: 'Run a secondary quality hunt excluding every current entry and replacing them with better currently operating places.',
  }, true));
  assert.equal(iterateResponse.status, 200);
  const iterated = await waitForHunt(huntId, state => state.profile.status === 'ready' && state.profile.iterationCount === 1);
  assert.equal(iterated.profile.iterationCount, 1);
  assert.ok(iterated.draftMap);
  const iteratedNames = iterated.draftMap.entries.map(entry => entry.name);
  assert.ok(!iteratedNames.includes('Emack & Bolio\'s Albany'));
  assert.ok(!iteratedNames.includes('Kurver Kreme'));
  assert.ok(iteratedNames.includes('Snowman Ice Cream'));

  const statusResponse = await huntStatusHandler(new Request(`https://local.test/.netlify/functions/hunt-status?id=${huntId}`));
  assert.equal(statusResponse.status, 200);
  const visible = await statusResponse.json() as HuntState;
  assert.equal(visible.draftMap?.title, 'Pistachio Ice Cream in Albany - Secondary Quality Pass');

  const approveResponse = await studioReviewActionHandler(jsonRequest('studio-review-action', {
    action: {
      mapSlug: spec.id,
      entryId: iterated.draftMap.entries[0]!.id,
      actionType: 'approve',
      actionMode: 'live',
      action: 'Approve',
      targetState: 'approved',
      reason: 'Journey test approval',
      note: 'Curator approved this provisional real-place entry for promotion review.',
      createdAt: new Date().toISOString(),
      source: 'journey-test',
    },
  }, true));
  assert.equal(approveResponse.status, 200);
  const approval = await approveResponse.json() as { action: StudioReviewActionRecord };
  assert.equal(approval.action.actionMode, 'live');
  assert.equal(approval.action.status, 'submitted');

  const batchResponse = await studioReviewActionHandler(jsonRequest('studio-review-action', {
    action: {
      mapSlug: spec.id,
      entryId: iterated.draftMap.entries[1]!.id,
      actionType: 'request_refinement',
      actionMode: 'batch',
      action: 'Request refinement',
      targetState: 'refinement_requested',
      reason: 'Needs grouped review',
      note: 'Hold for the next batch pass with stricter source guidance.',
      createdAt: new Date().toISOString(),
      source: 'journey-test',
    },
  }, true));
  assert.equal(batchResponse.status, 200);
  const batchAction = await batchResponse.json() as { action: StudioReviewActionRecord };
  assert.equal(batchAction.action.actionMode, 'batch');

  const promoteResponse = await huntPromoteHandler(jsonRequest('hunt-promote', { huntId }, true));
  assert.equal(promoteResponse.status, 200);
  const promoted = await waitForHunt(huntId, state => state.profile.status === 'promotion_dispatched');
  assert.equal(promoted.profile.promotion?.status, 'workflow_dispatched');
  assert.match(promoted.profile.promotion?.workflowUrl || '', /^local:\/\/mosaic\/hunt-promotion\//);

  const exportResponse = await promotionExportHandler(new Request(
    `https://local.test/.netlify/functions/hunt-promotion-export?promotionId=${encodeURIComponent(promoted.profile.promotion!.id)}`,
    { headers: { Authorization: 'Bearer journey-service-secret' } },
  ));
  assert.equal(exportResponse.status, 200);
  const artifact = await exportResponse.json() as {
    huntId: string;
    targetMapSlug: string;
    approvedEntries: Array<{ name: string; location: { address: string } }>;
  };
  assert.equal(artifact.huntId, huntId);
  assert.ok(artifact.targetMapSlug.length > 0);
  assert.ok(artifact.approvedEntries.length >= 2);
  assert.equal(artifact.approvedEntries[0]!.name, 'Snowman Ice Cream');

  console.log('Hunt journey verified: create -> view -> curate -> promote -> export.');
} finally {
  globalThis.fetch = originalFetch;
}

function jsonRequest(path: string, body: unknown, auth = false): Request {
  return new Request(`https://local.test/.netlify/functions/${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(auth ? { 'X-Mosaic-Hunt-Key': 'journey-secret' } : {}),
    },
    body: JSON.stringify(body),
  });
}

async function waitForHunt(huntId: string, predicate: (state: HuntState) => boolean): Promise<HuntState> {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    const state = await loadHuntState(huntId);
    if (state && predicate(state)) return state;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  const state = await loadHuntState(huntId);
  throw new Error(`Timed out waiting for Hunt ${huntId}. Last status: ${state?.profile.status || 'missing'}`);
}

function refinedSpecContent() {
  return {
    title: 'Pistachio Ice Cream in Albany',
    topic: 'pistachio ice cream',
    intent: 'Create a provisional Mosaic draft of real places in the Albany area that can support pistachio ice cream research.',
    scope: 'Capital District only with exact addresses and current source leads.',
    geography: { label: 'Capital District, New York' },
    mustHaveConstraints: ['Exact street address', 'Real named place', 'Current source lead'],
    exclusions: ['Generic chains', 'Placeholder candidates'],
    photoPolicy: 'Use pending photo status until a curator verifies real location-tied product photos.',
    desiredScale: { initialEntries: 3, targetEntries: 10 },
    qualityTargets: ['real named places', 'exact addresses', 'source leads', 'no placeholder candidates'],
  };
}

function draftMapContent(iteration: number) {
  if (iteration > 0) {
    return {
      title: 'Pistachio Ice Cream in Albany - Secondary Quality Pass',
      tagline: 'Replacement candidates with stronger current operating signals.',
      narrative: 'A secondary quality pass excluding the first draft entries and suppressing stale candidates.',
      entries: [
        {
          id: 'snowman-ice-cream-troy',
          name: 'Snowman Ice Cream',
          location: {
            address: '531 5th Ave',
            city: 'Troy',
            region: 'NY',
            country: 'USA',
            lat: 42.7571,
            lng: -73.6814,
          },
          summary: 'Currently operating seasonal ice cream stand with official web and social source leads for flavor verification.',
          confidence: 'medium',
          evidenceHints: [
            'Official website/store profile: https://snowmanicecream.com/',
            'Active Facebook or Instagram pistachio ice cream flavor posts from 2025-2026: https://www.facebook.com/snowmanicecream',
          ],
          tags: ['ice cream', 'troy', 'seasonal'],
          photoStatus: 'pending',
          provisionalReason: 'Replacement candidate with exact address and current operating source leads; still requires public promotion validation.',
        },
        {
          id: 'dutch-udder-troy',
          name: 'The Dutch Udder Craft Ice Cream',
          location: {
            address: '282 River St',
            city: 'Troy',
            region: 'NY',
            country: 'USA',
            lat: 42.7329,
            lng: -73.6910,
          },
          summary: 'Currently operating Troy scoop shop with official menu/social source leads for rotating flavor verification.',
          confidence: 'medium',
          evidenceHints: [
            'Official website/menu source lead for pistachio ice cream: https://www.thedutchudder.com/',
            'Active Instagram flavor posts from 2025-2026: https://www.instagram.com/thedutchudder/',
          ],
          tags: ['ice cream', 'troy', 'craft', 'pistachio'],
          photoStatus: 'pending',
          provisionalReason: 'Replacement candidate with exact address and current operating source leads; still requires public promotion validation.',
        },
      ],
      suppressedCandidates: [
        {
          name: 'Berben & Wolff\'s Albany',
          reason: 'Suppressed because closure/stale operating signals conflict with current-place requirement.',
        },
      ],
    };
  }

  return {
    title: 'Pistachio Ice Cream in Albany',
    tagline: 'Provisional real-place draft for Albany pistachio ice cream research.',
    narrative: iteration > 0
      ? 'Iteration tightened address and evidence leads for the provisional draft.'
      : 'A provisional draft using real named places and address-level leads before GitHub validation.',
    entries: [
      {
        id: 'emack-bolios-albany',
        name: 'Emack & Bolio\'s Albany',
        location: {
          address: '366 Delaware Ave',
          city: 'Albany',
          region: 'NY',
          country: 'USA',
          lat: 42.6427,
          lng: -73.7788,
        },
        summary: 'Albany scoop shop candidate for pistachio ice cream research, pending menu and product-photo verification.',
        confidence: 'medium',
        evidenceHints: [
          'Official shop listing for pistachio ice cream research: https://www.emackandbolios.com/',
          'Current social flavor lead from 2025-2026: https://www.instagram.com/emackandbolios/',
        ],
        tags: ['ice cream', 'albany', 'pistachio'],
        photoStatus: 'pending',
        provisionalReason: 'Real place with exact address; still requires source and photo validation before public promotion.',
      },
      {
        id: 'kurver-kreme-albany',
        name: 'Kurver Kreme',
        location: {
          address: '1349 Central Ave',
          city: 'Albany',
          region: 'NY',
          country: 'USA',
          lat: 42.7053,
          lng: -73.8192,
        },
        summary: 'Long-running Albany ice cream stand candidate for pistachio ice cream research.',
        confidence: 'medium',
        evidenceHints: [
          'Official shop site for pistachio ice cream research: https://www.kurverkreme.com/',
          'Current social flavor board lead from 2025-2026: https://www.facebook.com/kurverkreme/',
        ],
        tags: ['ice cream', 'albany', 'seasonal', 'pistachio'],
        photoStatus: 'pending',
        provisionalReason: 'Real place with exact address; still requires source and photo validation before public promotion.',
      },
    ],
    suppressedCandidates: [
      {
        name: 'Generic mall ice cream listing',
        reason: 'Suppressed because it lacked exact source evidence.',
      },
    ],
  };
}
