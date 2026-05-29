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

    await expect(page.getByRole('heading', { name: 'Research Batches' })).toBeVisible();
    await expect(page.getByText('Ice Cream – Capital District')).toBeVisible();
  });
});
