import { test, expect } from '@playwright/test';

const basePath = process.env.MOSAIC_TEST_BASE_PATH || '/mosaic/v4/';
const route = (path = '') => `${basePath}${path}`;

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
    // The config starts the preview server with the versioned production base path.
    // We try the root first (preview often serves it), then fall back.
    await page.goto('/').catch(() => {});
    await page.goto(basePath).catch(() => {});

    await page.waitForSelector('#app', { timeout: 15000 });
  });

  test('gallery loads and shows live maps', async ({ page }) => {
    await expect(page.locator('text=Start a Hunt')).toBeVisible();
    await expect(page.locator('text=LIVE MAPS')).toBeVisible();

    // At least one map card should be present (Ice Cream or others)
    const mapCards = page.locator('[data-slug]');
    await expect(mapCards.first()).toBeVisible();
  });

  test('Hunt launcher creates a static GitHub issue handoff', async ({ page }) => {
    await page.getByRole('button', { name: /Open GitHub Hunt/i }).click();

    const issueLink = page.getByRole('link', { name: /Open GitHub Hunt/i });
    await expect(issueLink).toBeVisible();

    const href = await issueLink.getAttribute('href');
    const issueUrl = new URL(href || '');
    const body = issueUrl.searchParams.get('body') || '';

    expect(issueUrl.href).toContain('github.com/gitbrainlab/mosaic/issues/new');
    expect(issueUrl.searchParams.get('template')).toBe('hunt.md');
    expect(body).toContain('mosaic-hunt-spec:start');
    expect(body).toContain('Research artifacts first');
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
    await page.goto(route('?/map/ice-cream-capital-district'));
    await page.waitForTimeout(1200);

    const listBtn = page.locator('#show-list-header');
    await expect(listBtn).toBeVisible();
    await expect(listBtn).toHaveText(/List/i);
  });

  test('studio loads committed research batches', async ({ page }) => {
    await page.goto(route('?/studio'));

    await expect(page.getByRole('heading', { name: 'Research Batches' })).toBeVisible();
    await expect(page.getByText('Ice Cream – Capital District')).toBeVisible();
  });

  test('studio exposes Hunt candidates as pre-release review items', async ({ page }) => {
    await page.goto(route('?/studio'));

    await expect(page.getByText('Hunt: veal parm in capital district').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('pre-release Hunt candidates').first()).toBeVisible();
    await expect(page.getByText('Lombardo\'s Restaurant').first()).toBeVisible();
    await expect(page.getByText('Pre-release Hunt / Needs Photo Review').first()).toBeVisible();
    await expect(page.getByText('Photo Briefs').first()).toBeVisible();
    await expect(page.getByRole('link', { name: /Open candidates/i })).toBeVisible();
  });
});
