import { test, expect } from '@playwright/test';

/**
 * @smoke
 *
 * Minimal smoke tests that run as part of `npm test`.
 * These exercise the core happy paths across the most important viewports.
 *
 * Heavy visual design regression lives in the custom scripts
 * invoked by `npm run test:regression`.
 */

test.describe('@smoke Mosaic Smoke Tests', () => {
  test.beforeEach(async ({ page }) => {
    // The config starts the preview server with the v3 production base path.
    // We try the root first (preview often serves it), then fall back.
    await page.goto('/').catch(() => {});
    await page.goto('/mosaic/v3/').catch(() => {});

    await page.waitForSelector('#app', { timeout: 15000 });
  });

  test('gallery loads and shows live maps', async ({ page }) => {
    await expect(page.locator('text=Start a Hunt')).toBeVisible();
    await expect(page.locator('text=LIVE MAPS')).toBeVisible();

    // At least one map card should be present (Ice Cream or others)
    const mapCards = page.locator('[data-slug]');
    await expect(mapCards.first()).toBeVisible();
  });

  test('Hunt launcher starts Netlify queue path or shows manual fallback', async ({ page }) => {
    await page.getByRole('button', { name: /Start Hunt/i }).click();

    await expect(page.getByText('NETLIFY QUEUED HUNT')).toBeVisible();
    await expect(page.getByText('Hunt service unavailable')).toBeVisible();
    const fallbackLink = page.getByRole('link', { name: /Manual GitHub fallback/i });
    await expect(fallbackLink).toBeVisible();

    const href = await fallbackLink.getAttribute('href');
    const issueUrl = new URL(href || '');
    const body = issueUrl.searchParams.get('body') || '';

    expect(issueUrl.href).toContain('github.com/gitbrainlab/mosaic/issues/new');
    expect(issueUrl.searchParams.get('template')).toBe('hunt.md');
    expect(body).toContain('mosaic-hunt-spec:start');
    expect(body).toContain('Research artifacts first');
  });

  test('Hunt journey creates, views, and requests promotion for a draft map', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'Full Hunt journey runs once.');

    let huntId = 'hunt-ui-journey';
    let promoted = false;
    let iterated = false;
    const readyState = () => ({
      profile: {
        id: huntId,
        spec: {
          id: huntId,
          title: 'Pistachio Ice Cream in Albany',
          topic: 'pistachio ice cream',
          intent: 'Create a provisional real-place draft.',
          scope: 'Capital District only.',
          geography: { label: 'Capital District, New York' },
          mustHaveConstraints: ['Exact street address', 'Real named place'],
          exclusions: ['Placeholder candidates'],
          photoPolicy: 'Real location-tied photos required before public promotion.',
          desiredScale: { initialEntries: 2, targetEntries: 10 },
          qualityTargets: ['real places', 'exact addresses'],
          createdAt: '2026-05-30T00:00:00.000Z',
          updatedAt: '2026-05-30T00:00:00.000Z',
        },
        status: promoted ? 'promotion_dispatched' : 'ready',
        visibility: 'public',
        iterationCount: iterated ? 1 : 0,
        maxIterations: 3,
        createdAt: '2026-05-30T00:00:00.000Z',
        updatedAt: '2026-05-30T00:00:00.000Z',
        ...(promoted ? {
          promotion: {
            id: 'promo-ui-journey',
            huntId,
            status: 'workflow_dispatched',
            requestedAt: '2026-05-30T00:00:00.000Z',
            targetMapSlug: 'pistachio-ice-cream-albany',
            workflowUrl: 'local://mosaic/hunt-promotion/promo-ui-journey',
          },
        } : {}),
      },
      draftMap: {
        id: 'draft-ui-journey',
        huntId,
        title: iterated ? 'Pistachio Ice Cream in Albany - Secondary Quality Pass' : 'Pistachio Ice Cream in Albany',
        tagline: iterated ? 'Replacement candidates with stronger current signals.' : 'Provisional real-place draft.',
        narrative: iterated ? 'A secondary quality pass excluding first-draft entries.' : 'A provisional draft using real named places before GitHub validation.',
        generatedAt: '2026-05-30T00:00:00.000Z',
        iteration: iterated ? 1 : 0,
        entries: iterated ? [
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
            summary: 'Replacement candidate with active official/social source leads.',
            confidence: 'medium',
            evidenceHints: [
              'Official website/store profile for pistachio ice cream research: https://snowmanicecream.com/',
              'Active Facebook or Instagram flavor posts from 2025-2026: https://www.facebook.com/snowmanicecream',
            ],
            tags: ['ice cream', 'troy'],
            photoStatus: 'pending',
            provisionalReason: 'Replacement candidate with current operating source leads.',
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
            summary: 'Replacement candidate with active menu and social source leads.',
            confidence: 'medium',
            evidenceHints: [
              'Official website/menu source lead for pistachio ice cream: https://www.thedutchudder.com/',
              'Active Instagram flavor posts from 2025-2026: https://www.instagram.com/thedutchudder/',
            ],
            tags: ['ice cream', 'troy', 'pistachio'],
            photoStatus: 'pending',
            provisionalReason: 'Replacement candidate with current operating source leads.',
          },
        ] : [
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
            summary: 'Real Albany scoop shop candidate pending product-photo verification.',
            confidence: 'medium',
            evidenceHints: [
              'Official shop listing for pistachio ice cream research: https://www.emackandbolios.com/',
              'Current flavor source lead from 2025-2026: https://www.instagram.com/emackandbolios/',
            ],
            tags: ['ice cream', 'albany'],
            photoStatus: 'pending',
            provisionalReason: 'Real place with exact address; requires validation before public promotion.',
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
            summary: 'Real Albany ice cream stand candidate for pistachio ice cream research.',
            confidence: 'medium',
            evidenceHints: [
              'Official shop listing for pistachio ice cream research: https://www.kurverkreme.com/',
              'Current flavor board source lead from 2025-2026: https://www.facebook.com/kurverkreme/',
            ],
            tags: ['ice cream', 'albany', 'pistachio'],
            photoStatus: 'pending',
            provisionalReason: 'Real place with exact address; requires validation before public promotion.',
          },
        ],
        suppressedCandidates: iterated
          ? [{ name: 'Berben & Wolff\'s Albany', reason: 'Suppressed because closed/stale signals conflict with current-place requirement.' }]
          : [{ name: 'Placeholder listing', reason: 'Suppressed by quality gate.' }],
      },
      events: [
        {
          id: 'evt-ready',
          huntId,
          type: 'status',
          stage: promoted ? 'promotion_dispatched' : 'ready',
          message: promoted ? 'GitHub promotion workflow dispatched.' : 'Rapid draft map ready (live mode).',
          severity: 'info',
          createdAt: '2026-05-30T00:00:00.000Z',
        },
      ],
      jobs: [
        {
          jobId: 'job-ui-journey',
          huntId,
          kind: 'create',
          eventName: 'hunt.create',
          status: 'ready',
          attemptCount: 1,
          createdAt: '2026-05-30T00:00:00.000Z',
        },
      ],
    });

    await page.route('**/.netlify/functions/hunt-create', async route => {
      const body = route.request().postDataJSON() as { spec?: { id?: string } };
      huntId = body.spec?.id || huntId;
      const queued = readyState();
      queued.profile.status = 'queued';
      queued.draftMap = null;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(queued) });
    });
    await page.route('**/.netlify/functions/hunt-status**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(readyState()) });
    });
    await page.route('**/.netlify/functions/hunt-iterate', async route => {
      iterated = true;
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(readyState()) });
    });
    await page.route('**/.netlify/functions/hunt-promote', async route => {
      promoted = true;
      const nextState = readyState();
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ promotion: nextState.profile.promotion, state: nextState }),
      });
    });

    await page.evaluate(() => localStorage.setItem('mosaic:huntAccessKey', 'iceicebaby'));
    await page.locator('#hunt-input').fill('Pistachio Ice Cream in Albany');
    await page.getByRole('button', { name: /Start Hunt/i }).click();

    await page.waitForURL('**/hunts/**', { timeout: 10000 });
    await expect(page.locator('#hunt-map')).toBeVisible();
    await expect(page.locator('main').getByText('Pistachio Ice Cream in Albany')).toBeVisible();
    await expect(page.getByText('Emack & Bolio\'s Albany')).toBeVisible();
    await expect(page.getByText('candidate 1')).toHaveCount(0);
    await page.getByRole('button', { name: 'Details' }).first().click();
    const firstDetail = page.locator('[data-hunt-entry-detail="emack-bolios-albany"]');
    await expect(firstDetail).toBeVisible();
    await expect(firstDetail.getByText('Exact address', { exact: true })).toBeVisible();
    await expect(firstDetail.getByText('366 Delaware Ave, Albany, NY, USA')).toBeVisible();
    await expect(firstDetail.getByText('Official shop listing')).toBeVisible();
    await page.getByRole('button', { name: /Deepen Draft/i }).click();
    await expect(page.getByText('Snowman Ice Cream')).toBeVisible();
    await expect(page.getByText('Emack & Bolio\'s Albany')).toHaveCount(0);
    await expect(page.getByText('Berben & Wolff\'s Albany')).toBeVisible();

    await page.getByRole('button', { name: /Request Promotion/i }).click();
    await expect(page.getByText('promotion_dispatched')).toBeVisible();
    await expect(page.getByText('Open GitHub Actions promotion')).toBeVisible();
  });

  test('can navigate to the Ice Cream map', async ({ page }) => {
    const iceCreamCard = page.locator('[data-slug="ice-cream-capital-district"]');
    await expect(iceCreamCard).toBeVisible();

    await iceCreamCard.click();

    // Should land on the map view
    await expect(page.locator('#map')).toBeVisible({ timeout: 8000 });
    await expect(page.locator('text=Ice Cream in the Capital District')).toBeVisible();
  });

  test('map view has the header List button (no bottom nav collision)', async ({ page }) => {
    await page.goto('/mosaic/v3/?/map/ice-cream-capital-district');
    await page.waitForTimeout(1200);

    const listBtn = page.locator('#show-list-header');
    await expect(listBtn).toBeVisible();
    await expect(listBtn).toHaveText(/List/i);
  });

  test('studio loads committed research batches', async ({ page }) => {
    await page.goto('/mosaic/v3/?/studio');

    await expect(page.getByRole('heading', { name: 'Curation Dashboard' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Committed maps' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Veal Parm – Capital District' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Static batch artifacts' })).toBeVisible();
  });
});
