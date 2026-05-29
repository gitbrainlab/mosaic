/**
 * Full UI Regression for Design Review
 * Covers multiple viewports + light/dark + key flows
 */

import { chromium, devices, type Page } from 'playwright';
import { mkdirSync } from 'fs';

const OUT = 'tests/screenshots/design-review';
mkdirSync(OUT, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812, device: devices['iPhone 14'] },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

async function capture(page: Page, path: string) {
  try {
    await page.screenshot({ path, fullPage: true });
  } catch {
    await page.waitForTimeout(300);
    await page.screenshot({ path, fullPage: false });
  }
}

async function run() {
  for (const vp of VIEWPORTS) {
    for (const mode of ['light', 'dark'] as const) {
      const browser = await chromium.launch({ headless: true });
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
      await capture(page, `${OUT}/${prefix}-01-gallery.png`);

      // Open advanced guidance
      await page.click('#toggle-guidance').catch(() => {});
      await page.waitForTimeout(300);
      await capture(page, `${OUT}/${prefix}-02-hunt-guidance.png`);

      // 2. Ice Cream map
      await page.goto('http://127.0.0.1:5173/');
      await page.click('[data-slug="ice-cream-capital-district"]');
      await page.waitForTimeout(2000);
      await capture(page, `${OUT}/${prefix}-03-map-initial.png`);

      // Open list on mobile/tablet via header action (no longer collides with bottom nav)
      if (vp.name !== 'desktop') {
        await page.click('#show-list-header').catch(() => {});
        await page.waitForTimeout(400);
        await capture(page, `${OUT}/${prefix}-04-map-list-open.png`);
      }

      // Click first list item → open detail
      if (vp.name === 'desktop') {
        await page.locator('#entry-list .entry-row').first().click({ force: true }).catch(() => {});
      } else {
        await page.locator('#mobile-list .entry').first().click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(700);
      await capture(page, `${OUT}/${prefix}-05-detail-open.png`);

      await context.close();
      await browser.close();
    }
  }
  console.log('Regression screenshots saved to tests/screenshots/design-review/');
}

run().catch(console.error);
