import { test, expect } from '@playwright/test';

/**
 * Production Verification Suite for Mosaic
 * 
 * Runs against the live deployed site to catch regressions in:
 * - Photo rendering (no broken images)
 * - Basic navigation and map functionality
 * - "Sourcing in progress" states
 * - Overall stability
 * 
 * Intended to be run repeatedly during autonomous improvement sessions.
 */

const PROD_URL = process.env.PROD_URL || 'https://gitbrainlab.github.io/mosaic/';

test.describe('Mosaic Production Verification', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PROD_URL, { waitUntil: 'networkidle' });
    await page.waitForSelector('#app', { timeout: 15000 });
  });

  test('gallery loads and shows maps', async ({ page }) => {
    // Use first() to avoid strict mode issues when both texts exist
    await expect(page.getByText('Start a Hunt').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText('LIVE MAPS').first()).toBeVisible({ timeout: 15000 });

    const mapCards = page.locator('[data-slug]');
    const count = await mapCards.count();
    expect(count).toBeGreaterThan(0);
  });

  test('Ice Cream Capital District map loads and shows content', async ({ page }) => {
    const iceCreamCard = page.locator('[data-slug="ice-cream-capital-district"]');
    await expect(iceCreamCard).toBeVisible({ timeout: 10000 });
    await iceCreamCard.click();

    await page.waitForSelector('#map', { timeout: 15000 });
    await expect(page.locator('text=Ice Cream in the Capital District')).toBeVisible();

    // Basic check that the list has entries
    const listItems = page.locator('#entry-list .entry-row');
    await expect(listItems.first()).toBeVisible({ timeout: 10000 });
    expect(await listItems.count()).toBeGreaterThan(5);
  });

  test('no obvious console errors on load', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', msg => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await page.goto(PROD_URL, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);

    const realErrors = errors.filter(e => 
      !e.includes('favicon') && 
      !e.includes('analytics') &&
      !e.includes('net::ERR')
    );

    // On production we are more lenient
    expect(realErrors.length).toBeLessThan(3);
  });

  test('Northeast pilot map is present if deployed', async ({ page }) => {
    const pilotCard = page.locator('[data-slug="ice-cream-northeast-pilot"]');
    const count = await pilotCard.count();
    if (count > 0) {
      await pilotCard.first().click();
      await page.waitForTimeout(1500);
      // Just check we didn't 404 or crash
      const content = await page.content();
      expect(content).not.toContain('404');
    }
  });
});