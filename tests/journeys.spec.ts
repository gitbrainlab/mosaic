import { expect, test, type Page } from '@playwright/test';
import type { HuntState, HuntSpec, PromotionRequest } from '../src/types/hunt';
import { selectPersonaWave } from './persona-wave';

const personas = selectPersonaWave(undefined, 4);
const allowedProjects = new Set(['mobile-light', 'mobile-dark', 'desktop-light']);

test.describe('@journey Mosaic user journeys', () => {
  test.describe.configure({ mode: 'parallel' });

  for (const persona of personas) {
    test(`${persona.title} can create, curate, publish, and view a map`, async ({ page }, testInfo) => {
      test.skip(!allowedProjects.has(testInfo.project.name), 'Journey coverage runs on the primary mobile and desktop projects.');

      await page.addInitScript(() => {
        try {
          localStorage.setItem('mosaic:huntAccessKey', 'iceicebaby');
        } catch {
          // Ignore storage restrictions.
        }
      });

      const hunt = buildHuntHarness(persona);
      await installHuntRoutes(page, hunt);

      await page.goto('/mosaic/v3/');
      await expect(page.getByText('Start a Hunt')).toBeVisible();
      await page.locator('#hunt-input').fill(persona.huntTopic);
      await page.locator('#toggle-guidance').click();
      await page.locator('#hunt-guidance').fill(persona.guidance);
      await page.getByRole('button', { name: /Start Hunt/i }).click();

      await expect(page.getByText('NETLIFY QUEUED HUNT')).toBeVisible();
      await expect(page.getByText('Hunt queued. Opening the live draft workspace...')).toBeVisible();
      await page.waitForURL('**/hunts/**', { timeout: 10000 });
      await expect(page.locator('#hunt-map')).toBeVisible();
      await expect(page.getByText('Draft generation is running.')).toBeVisible();
      await page.waitForTimeout(3500);
      await expect(page.getByText('Example Quality Candidate')).toBeVisible();
      await expect(page.getByText('Second Quality Candidate')).toBeVisible();

      await expect(page.getByRole('button', { name: 'Details' }).first()).toBeVisible();
      await page.getByRole('button', { name: 'Details' }).first().click();
      const firstDetail = page.locator('[data-hunt-entry-detail]').first();
      await expect(firstDetail.locator('dt', { hasText: 'Exact address' })).toBeVisible();
      await expect(firstDetail.locator('dt', { hasText: 'Evidence leads' })).toBeVisible();
      await expect(firstDetail.locator('dt', { hasText: 'Provisional note' })).toBeVisible();
      await expect(firstDetail.getByText('Photo review', { exact: true })).toBeVisible();
      await expect(firstDetail.getByRole('button', { name: 'Next candidate' })).toBeVisible();
      await firstDetail.getByRole('button', { name: 'Prioritize photos' }).click();
      await expect(page.locator('#iteration-instruction')).toHaveValue(/Prioritize photo verification/);

      await page.getByRole('button', { name: /Deepen Draft/i }).click();
      await expect(page.getByText('Secondary quality pass')).toBeVisible();
      await expect(page.getByText('Suppressed')).toBeVisible();

      await page.getByRole('button', { name: /Request Promotion/i }).click();
      await expect(page.getByText('promotion_dispatched', { exact: true })).toBeVisible();
      await expect(page.getByRole('link', { name: /Open GitHub Actions promotion/i })).toBeVisible();

      await page.getByRole('button', { name: 'Maps' }).click();
      await expect(page.getByText('LIVE MAPS')).toBeVisible();
      await page.locator(`[data-slug="${persona.mapSlug}"]`).click();
      await expect(page.locator('#map')).toBeVisible({ timeout: 15000 });
    });
  }

  test('desktop curator review submits live actions and enrichment jobs', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'Studio workflow coverage runs on desktop-light.');

    await page.addInitScript(() => {
      try {
        localStorage.setItem('mosaic:huntAccessKey', 'iceicebaby');
      } catch {
        // Ignore storage restrictions.
      }
    });

    const reviewState = buildStudioHarness(personas[0]);
    await installStudioRoutes(page, reviewState);

    await page.goto('/mosaic/v3/?/studio');
    await expect(page.getByRole('heading', { name: 'Curation Dashboard' })).toBeVisible({ timeout: 15000 });

    const photoQueueCard = page.locator('[data-queue-section="Needs Photo Review"] [data-review-card]').first();
    await expect(photoQueueCard).toBeVisible();
    await photoQueueCard.click();
    const selectedReviewKey = await photoQueueCard.getAttribute('data-review-key');
    expect(selectedReviewKey).toBeTruthy();

    const activePreview = page.locator(`[data-review-preview][data-review-key="${selectedReviewKey}"]`);
    await expect(activePreview.getByRole('button', { name: /Find real photos/i })).toBeVisible();
    await expect(activePreview.getByRole('button', { name: /Enrich evidence/i })).toBeVisible();
    await expect(activePreview.getByRole('button', { name: /Verify address/i })).toBeVisible();

    await activePreview.getByRole('button', { name: /Find real photos/i }).click();
    await expect(activePreview.locator('.studio-enrichment-result')).toBeVisible({ timeout: 8000 });
    await expect(activePreview.getByText('live result')).toBeVisible();
    await expect(activePreview.getByText('Real location-tied photo candidate.')).toBeVisible();

    await page.getByLabel('Curator note').fill(personas[0].curatorNote);
    const approveButton = activePreview.getByRole('button', { name: 'Approve' });
    await expect(approveButton).toBeVisible();
    await approveButton.evaluate(node => (node as HTMLButtonElement).click());
    await expect(page.locator('#studio-action-payload')).toContainText('"action": "Approve"');
    await expect(page.locator('#studio-action-payload')).toContainText(personas[0].curatorNote);
    await page.getByRole('button', { name: 'Submit action' }).click();
    await expect(page.locator('#studio-action-status')).toContainText('Submitted for live provisional Studio processing');
  });

  test('mobile rotation keeps the shell, info view, and map list stable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Rotation coverage runs on mobile-light.');

    await page.goto('/mosaic/v3/');
    await expect(page.getByText('Start a Hunt')).toBeVisible();

    await page.setViewportSize({ width: 812, height: 375 });
    await page.waitForTimeout(250);
    await expect(page.getByText('LIVE MAPS')).toBeVisible();
    await expect(page.locator('#bottom-nav')).toBeVisible();

    await page.getByRole('button', { name: 'Info' }).click();
    await expect(page.getByRole('heading', { name: 'How Mosaic is wired' })).toBeVisible();
    await expect(page.getByText('What happens when you press Approve in Studio')).toBeVisible();

    await page.getByRole('button', { name: 'Studio' }).click();
    await expect(page.getByRole('heading', { name: 'Curation Dashboard' })).toBeVisible();

    await page.goto('/mosaic/v3/?/map/ice-cream-capital-district');
    await expect(page.locator('#map')).toBeVisible({ timeout: 15000 });
    await page.locator('#show-list-header').click();
    await expect(page.locator('#mobile-list .entry').first()).toBeVisible();
  });
});

function buildHuntHarness(persona: typeof personas[number]) {
  const createdAt = '2026-05-31T04:00:00.000Z';
  const huntId = `hunt-${persona.id}`;
  const spec: HuntSpec = {
    id: huntId,
    title: `Hunt: ${persona.huntTopic}`,
    topic: persona.huntTopic,
    intent: `Create a high-quality Mosaic map for "${persona.huntTopic}" using current, verifiable, place-specific evidence before any public data promotion.`,
    scope: persona.guidance,
    geography: {
      label: 'Capital District / Albany region',
      coordinateBounds: {
        minLat: 42.35,
        maxLat: 43.25,
        minLng: -74.35,
        maxLng: -73.45,
      },
    },
    mustHaveConstraints: [
      'Exact street-level address for every candidate',
      'Valid coordinates matching that address',
      'Current or recent evidence of relevance',
      'Verified real photos tied to the actual place and map intent',
      `Curator guidance: ${persona.guidance}`,
    ],
    exclusions: [
      'Stock photos, generic storefronts, parking lots, or unrelated visuals',
      'Closed, stale, or weakly evidenced places',
      'Generic chains or filler unless explicitly requested and justified',
    ],
    photoPolicy: 'Use only real, location-tied photos that visibly show the thing the map is about. Keep unresolved photo work in review artifacts, not public entries.json.',
    desiredScale: {
      initialEntries: 8,
      targetEntries: 50,
    },
    qualityTargets: [
      'Research artifacts first; no raw candidate may write directly to public/data/maps',
      'Promotion requires exact address, valid coordinates, recent evidence, and verified real photos',
      'Rejected candidates must keep a rejection reason for review',
    ],
    createdAt,
    updatedAt: createdAt,
  };

  return {
    persona,
    createdAt,
    huntId,
    spec,
    ready: buildReadyHuntState(huntId, spec, persona),
    iterated: buildIteratedHuntState(huntId, spec, persona),
    promoted: buildPromotedHuntState(huntId, spec, persona),
  };
}

function buildQueuedHuntState(huntId: string, spec: HuntSpec, persona: typeof personas[number]): HuntState {
  return {
    profile: {
      id: huntId,
      spec,
      status: 'queued',
      visibility: 'public',
      iterationCount: 0,
      maxIterations: 3,
      createdAt: '2026-05-31T04:00:00.000Z',
      updatedAt: '2026-05-31T04:00:00.000Z',
    },
    draftMap: null,
    events: [
      {
        id: `evt-${persona.id}-queued`,
        huntId,
        type: 'status',
        stage: 'queued',
        message: 'Hunt queued and awaiting initial draft.',
        severity: 'info',
        createdAt: '2026-05-31T04:00:00.000Z',
      },
    ],
    jobs: [
      {
        jobId: `job-${persona.id}-create`,
        huntId,
        kind: 'create',
        eventName: 'hunt.create',
        status: 'queued',
        attemptCount: 1,
        createdAt: '2026-05-31T04:00:00.000Z',
      },
    ],
  };
}

function buildReadyHuntState(huntId: string, spec: HuntSpec, persona: typeof personas[number]): HuntState {
  return {
    profile: {
      id: huntId,
      spec,
      status: 'ready',
      visibility: 'public',
      iterationCount: 0,
      maxIterations: 3,
      createdAt: '2026-05-31T04:00:00.000Z',
      updatedAt: '2026-05-31T04:00:05.000Z',
    },
    draftMap: {
      id: `draft-${persona.id}`,
      huntId,
      title: `Draft: ${persona.huntTopic}`,
      tagline: 'Source-backed provisional map draft.',
      narrative: 'Initial draft produced from real, place-specific evidence.',
      generatedAt: '2026-05-31T04:00:05.000Z',
      iteration: 0,
      entries: [
        {
          id: `entry-${persona.id}-1`,
          name: 'Example Quality Candidate',
          location: {
            address: '123 Main St',
            city: 'Albany',
            region: 'NY',
            country: 'USA',
            lat: 42.6526,
            lng: -73.7562,
          },
          summary: 'Current operating candidate with exact address and current evidence.',
          confidence: 'medium',
          evidenceHints: [
            'Official menu or store listing: https://example.com/menu',
            'Recent social or review signal: https://example.com/social',
          ],
          tags: ['current', 'source-backed'],
          photoStatus: 'pending',
          provisionalReason: 'Provisional until reviewer confirms currency and photo quality.',
        },
        {
          id: `entry-${persona.id}-2`,
          name: 'Second Quality Candidate',
          location: {
            address: '456 River Rd',
            city: 'Troy',
            region: 'NY',
            country: 'USA',
            lat: 42.7284,
            lng: -73.6918,
          },
          summary: 'Secondary entry with clear place-specific evidence.',
          confidence: 'high',
          evidenceHints: [
            'Official website/menu listing: https://example.com/menu-2',
            'Recent photo or visual lead: https://example.com/photo',
          ],
          tags: ['photo-review', 'verified'],
          photoStatus: 'verified',
          provisionalReason: 'Photo-backed but still provisional in the draft stage.',
        },
      ],
      suppressedCandidates: [
        { name: 'Closed Example Place', reason: 'Suppressed because currency evidence is stale.' },
      ],
    },
    events: [
      {
        id: `evt-${persona.id}-ready`,
        huntId,
        type: 'status',
        stage: 'ready',
        message: 'Draft map is ready for review.',
        severity: 'info',
        createdAt: '2026-05-31T04:00:05.000Z',
      },
    ],
    jobs: [
      {
        jobId: `job-${persona.id}-create`,
        huntId,
        kind: 'create',
        eventName: 'hunt.create',
        status: 'ready',
        attemptCount: 1,
        createdAt: '2026-05-31T04:00:00.000Z',
        completedAt: '2026-05-31T04:00:05.000Z',
      },
    ],
  };
}

function buildIteratedHuntState(huntId: string, spec: HuntSpec, persona: typeof personas[number]): HuntState {
  const ready = buildReadyHuntState(huntId, spec, persona);
  return {
    ...ready,
    profile: {
      ...ready.profile,
      status: 'ready',
      iterationCount: 1,
      updatedAt: '2026-05-31T04:00:30.000Z',
    },
    draftMap: {
      ...ready.draftMap!,
      title: `Secondary pass: ${persona.huntTopic}`,
      narrative: 'Secondary quality pass excluded the original candidates and tightened currency filters.',
      iteration: 1,
      entries: [
        {
          id: `entry-${persona.id}-secondary-1`,
          name: 'Replacement Candidate',
          location: {
            address: '789 Broadway',
            city: 'Schenectady',
            region: 'NY',
            country: 'USA',
            lat: 42.8142,
            lng: -73.9396,
          },
          summary: 'Replacement candidate surfaced during the second research pass.',
          confidence: 'high',
          evidenceHints: ['https://example.com/current-source', 'https://example.com/recent-photo'],
          tags: ['replacement', 'current'],
          photoStatus: 'verified',
          provisionalReason: 'Accepted after suppressing stale candidates from the first pass.',
        },
      ],
      suppressedCandidates: [
        { name: 'Original First Draft Candidate', reason: 'Excluded by curator instruction because it was not current enough.' },
      ],
    },
    jobs: [
      {
        jobId: `job-${persona.id}-create`,
        huntId,
        kind: 'create',
        eventName: 'hunt.create',
        status: 'ready',
        attemptCount: 1,
        createdAt: '2026-05-31T04:00:00.000Z',
        completedAt: '2026-05-31T04:00:05.000Z',
      },
      {
        jobId: `job-${persona.id}-iterate`,
        huntId,
        kind: 'iterate',
        eventName: 'hunt.iterate',
        status: 'ready',
        attemptCount: 1,
        createdAt: '2026-05-31T04:00:25.000Z',
        completedAt: '2026-05-31T04:00:30.000Z',
      },
    ],
  };
}

function buildPromotedHuntState(huntId: string, spec: HuntSpec, persona: typeof personas[number]): HuntState {
  const iterated = buildIteratedHuntState(huntId, spec, persona);
  const promotion: PromotionRequest = {
    id: `promo-${persona.id}`,
    huntId,
    status: 'workflow_dispatched',
    requestedAt: '2026-05-31T04:00:45.000Z',
    targetMapSlug: persona.mapSlug,
    workflowUrl: 'local://github-actions/hunt-promotion',
    workflowRunUrl: 'local://github-actions/hunt-promotion/run',
  };

  return {
    ...iterated,
    profile: {
      ...iterated.profile,
      status: 'promotion_dispatched',
      promotion,
      updatedAt: '2026-05-31T04:00:45.000Z',
    },
    events: [
      ...iterated.events,
      {
        id: `evt-${persona.id}-promoted`,
        huntId,
        type: 'status',
        stage: 'promotion_dispatched',
        message: 'GitHub promotion workflow dispatched.',
        severity: 'info',
        createdAt: '2026-05-31T04:00:45.000Z',
      },
    ],
    jobs: [
      ...iterated.jobs,
      {
        jobId: `job-${persona.id}-promote`,
        huntId,
        kind: 'promote',
        eventName: 'hunt.promote',
        status: 'promotion_dispatched',
        attemptCount: 1,
        createdAt: '2026-05-31T04:00:40.000Z',
        completedAt: '2026-05-31T04:00:45.000Z',
        targetMapSlug: persona.mapSlug,
        workflowUrl: promotion.workflowUrl,
        workflowRunUrl: promotion.workflowRunUrl,
      },
    ],
  };
}

async function installHuntRoutes(page: Page, harness: ReturnType<typeof buildHuntHarness>) {
  let huntState = buildQueuedHuntState(harness.huntId, harness.spec, harness.persona);
  let statusCalls = 0;

  await page.route('**/.netlify/functions/hunt-create', async route => {
    const body = route.request().postDataJSON() as { spec?: { id?: string } };
    if (body.spec?.id) {
      huntState = buildQueuedHuntState(body.spec.id, harness.spec, personas[0]);
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(huntState) });
  });

  await page.route('**/.netlify/functions/hunt-status**', async route => {
    statusCalls += 1;
    const response = statusCalls === 1 ? huntState : harness.ready;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(response) });
  });

  await page.route('**/.netlify/functions/hunt-iterate', async route => {
    huntState = harness.iterated;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(huntState) });
  });

  await page.route('**/.netlify/functions/hunt-promote', async route => {
    huntState = harness.promoted;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ promotion: huntState.profile.promotion, state: huntState }),
    });
  });
}

function buildStudioHarness(persona: typeof personas[number]) {
  const mapSlug = persona.mapSlug;
  const entryId = persona.detailEntryId;
  const reviewItem = {
    mapSlug,
    mapTitle: mapSlug.replace(/-/g, ' '),
    entryId,
    entryName: 'Example Review Entry',
    city: 'Albany',
    confidence: 'medium',
    priorityScore: 64,
    issues: ['thin_evidence', 'missing_product_photos', 'missing_source_urls'],
  };

  return {
    reviewItem,
    reviewAction: {
      actionId: 'review-action-123',
      status: 'submitted',
      action: {
        mapSlug,
        entryId,
        actionType: 'approve',
        actionMode: 'live',
        action: 'Approve',
        reason: 'thin_evidence',
        targetState: 'approved_committed',
        note: persona.curatorNote,
        createdAt: '2026-05-31T04:00:00.000Z',
        source: 'mosaic-static-studio',
      },
    },
    enrichmentJob: {
      job: {
        jobId: 'enrichment-job-123',
        entryId,
        mapSlug,
        kind: 'enrich_photos',
        status: 'ready',
        attemptCount: 1,
        createdAt: '2026-05-31T04:00:00.000Z',
        completedAt: '2026-05-31T04:00:05.000Z',
        result: {
          summary: 'Source-backed photo candidates for curator review.',
          candidates: [
            {
              url: 'https://example.com/photo-1.jpg',
              sourceUrl: 'https://example.com/source-1',
              credit: 'Example Owner',
              caption: 'Real location-tied photo candidate.',
              confidence: 'high',
              locationTie: 'Matches storefront signage and menu board.',
              reviewNote: 'Approve if current operating status is confirmed.',
            },
          ],
          evidenceNotes: ['Use the current storefront and counter shot as proof.'],
          rejectionNotes: ['Suppressed stock-like results.'],
          generatedAt: '2026-05-31T04:00:05.000Z',
          mode: 'live',
        },
      },
    },
  };
}

async function installStudioRoutes(page: Page, harness: ReturnType<typeof buildStudioHarness>) {
  await page.route('**/.netlify/functions/studio-review-action', async route => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(harness.reviewAction),
    });
  });

  await page.route('**/.netlify/functions/studio-enrichment', async route => {
    const url = new URL(route.request().url());
    if (url.searchParams.has('jobId')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(harness.enrichmentJob),
      });
      return;
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(harness.enrichmentJob),
    });
  });
}
