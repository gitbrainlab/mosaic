/**
 * Full UI Regression for Design Review
 * Covers multiple viewports + light/dark + key flows
 */

import { chromium, devices } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'tests/screenshots/design-review';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812, device: devices['iPhone 14'] },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function run() {
  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    for (const mode of ['light', 'dark'] as const) {
      const context = await browser.newContext({
        ... (vp.device || {}),
        viewport: { width: vp.width, height: vp.height },
        colorScheme: mode,
      });
      const page = await context.newPage();

      const prefix = `${vp.name}-${mode}`;

      // 1. Gallery + Hunt
      await page.goto('http://127.0.0.1:5173/');
      await page.waitForTimeout(600);
      await page.screenshot({ path: `${OUT}/${prefix}-01-gallery.png`, fullPage: true });

      // Open advanced guidance
      await page.click('#toggle-guidance').catch(() => {});
      await page.waitForTimeout(300);
      await page.screenshot({ path: `${OUT}/${prefix}-02-hunt-guidance.png`, fullPage: true });

      // 2. Ice Cream map
      await page.goto('http://127.0.0.1:5173/');
      await page.click('[data-slug="ice-cream-capital-district"]');
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `${OUT}/${prefix}-03-map-initial.png`, fullPage: true });

      // Open list on mobile/tablet via header action (no longer collides with bottom nav)
      if (vp.name !== 'desktop') {
        await page.click('#show-list-header').catch(() => {});
        await page.waitForTimeout(400);
        await page.screenshot({ path: `${OUT}/${prefix}-04-map-list-open.png`, fullPage: true });
      }

      // Click first list item → open detail
      if (vp.name === 'desktop') {
        await page.locator('#entry-list .entry-row').first().click({ force: true }).catch(() => {});
      } else {
        await page.locator('#mobile-list .entry').first().click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(700);
      await page.screenshot({ path: `${OUT}/${prefix}-05-detail-open.png`, fullPage: true });

      await context.close();
    }
  }

  await browser.close();
  console.log('Regression screenshots saved to tests/screenshots/design-review/');
}

run().catch(console.error);