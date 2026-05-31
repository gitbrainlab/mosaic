/**
 * Mosaic Design & Style Regression (Playwright)
 * Full multi-viewport (375/768/1280) × light/dark verification of:
 * - Phase 1a neutral scaffold compliance (no premature brand tokens)
 * - "Show full list" / list affordance NOT occluded by bottom nav (Explore/Map/Studio)
 * - Photo-first detail rendering + graceful "Photos sourcing in progress" states
 * - Map first-load: loading overlay + fitBounds to data + auto-open first entry
 * - Desktop: bottom panel (not right sidebar blocking map)
 * - Mobile: BottomSheet peek/half/full with photo hero visible in peek
 * - Header clean (single Mosaic logo, no repeated wasting space)
 * - High-contrast neutral elements (borders, active filters, text)
 * - Hunt flow, gallery, map interactions
 *
 * Run with: npx tsx tests/verify-design-regression.ts
 * Requires: dev server at http://127.0.0.1:5173
 */

import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync, existsSync } from 'fs';
import { join } from 'path';

const OUT_DIR = 'tests/screenshots/design-review';
mkdirSync(OUT_DIR, { recursive: true });

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 900 },
];

const SCHEMES = ['light', 'dark'] as const;

async function waitForServer(page: Page, maxMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    try {
      await page.goto('http://127.0.0.1:5173/', { timeout: 3000 });
      await page.waitForSelector('#app', { timeout: 2000 });
      return;
    } catch {
      await new Promise(r => setTimeout(r, 400));
    }
  }
  throw new Error('Dev server not responding at 127.0.0.1:5173');
}

async function capture(page: Page, name: string) {
  await page.waitForTimeout(180);
  const path = join(OUT_DIR, `${name}.png`);
  try {
    await page.screenshot({ path, fullPage: true });
  } catch {
    await page.waitForTimeout(300);
    await page.screenshot({ path, fullPage: false });
  }
  console.log(`  ✓ ${name}.png`);
  return path;
}

async function runRegression() {
  console.log('=== Mosaic Design Regression (full) ===');
  console.log('Viewports:', VIEWPORTS.map(v => v.name).join(', '));
  console.log('Schemes:', SCHEMES.join('/'));
  console.log('Output:', OUT_DIR);
  console.log('');

  for (const vp of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      const prefix = `${vp.name}-${scheme}`;
      console.log(`\n[${prefix}]`);

      const browser = await chromium.launch({ headless: true });
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height },
        colorScheme: scheme,
        deviceScaleFactor: 2,
      });
      const page = await context.newPage();

      // 1. Gallery + Hunt launcher (check clean header, no redundant Mosaic in content)
      await waitForServer(page);
      await capture(page, `${prefix}-01-gallery`);

      // Hunt guidance open
      await page.click('#toggle-guidance').catch(() => {});
      await page.waitForTimeout(200);
      await capture(page, `${prefix}-02-hunt-guidance`);

      // 2. Open the Ice Cream map (the primary demo)
      await page.goto('http://127.0.0.1:5173/');
      await page.waitForSelector('[data-slug="ice-cream-capital-district"]');
      await page.click('[data-slug="ice-cream-capital-district"]');

      // Wait for map + fitBounds + loading overlay removal + auto detail attempt
      await page.waitForTimeout(2200);
      await capture(page, `${prefix}-03-map-initial`);

      // Verify the header "List" button exists and is the mechanism (no bottom bar)
      const listBtn = await page.$('#show-list-header');
      if (!listBtn) {
        console.warn('  ⚠ #show-list-header not found — regression may have stale DOM');
      }

      // 3. Exercise list via header button (this was the occluded "Show full list")
      if (vp.name !== 'desktop') {
        await page.click('#show-list-header').catch(() => {});
        await page.waitForTimeout(450);
        await capture(page, `${prefix}-04-map-list-sheet`);

        // Close sheet by clicking backdrop-ish or escape simulation
        await page.keyboard.press('Escape').catch(() => {});
        await page.waitForTimeout(200);
      } else {
        // Desktop: sidebar list should be visible; click first row
        await page.waitForSelector('#entry-list .entry-row', { timeout: 3000 }).catch(() => {});
      }

      // 4. Open a detail (exercises photo-first or sourcing state + flyTo)
      // On mobile the list sheet may still be open or we use map marker / sidebar
      if (vp.name !== 'desktop') {
        // Re-open list and click first
        await page.click('#show-list-header').catch(() => {});
        await page.waitForTimeout(300);
        await page.locator('#mobile-list .entry').first().click({ force: true }).catch(() => {});
      } else {
        await page.locator('#entry-list .entry-row').first().click({ force: true }).catch(() => {});
      }
      await page.waitForTimeout(750);
      await capture(page, `${prefix}-05-detail-photo-first`);

      // 5. Desktop-specific: verify bottom panel (not right-destroying panel)
      if (vp.name === 'desktop') {
        // Already open from above; capture shows bottom panel + map context
        // Also test closing it restores map padding
        await page.waitForTimeout(200);
        const closeX = await page.$('button[aria-label="Close"]');
        if (closeX) {
          await closeX.click();
          await page.waitForTimeout(300);
        }
        await capture(page, `${prefix}-06-detail-closed-desktop`);
      }

      // 6. Quick filter interaction (active states, contrast)
      if (vp.name === 'desktop') {
        const highBtn = await page.$('.filter-btn[data-filter="high"]');
        if (highBtn) {
          await highBtn.click();
          await page.waitForTimeout(150);
          await capture(page, `${prefix}-07-filter-high-active`);
        }
      }

      // 7. Back to gallery to close loop
      await page.click('#back-btn').catch(() => {});
      await page.waitForTimeout(300);
      await capture(page, `${prefix}-08-back-to-gallery`);

      await context.close();
      await browser.close();
    }
  }

  console.log('\n=== Regression complete ===');
  console.log(`Review screenshots in ${OUT_DIR}`);
  console.log('Key things to visually verify in the PNGs:');
  console.log('  • Header "List" button visible and tappable (no overlap with bottom nav on mobile/tablet)');
  console.log('  • Detail sheets/panels lead with photo or clear "sourcing in progress" dashed box');
  console.log('  • Map initial load shows data fit (not beige nowhere) + overlay cleared');
  console.log('  • Desktop detail is bottom panel (map remains visible behind/above)');
  console.log('  • High contrast on borders, filter active states, text on neutral bg');
  console.log('  • No repeated "Mosaic" branding in content areas');
}

runRegression().catch(err => {
  console.error('Regression failed:', err);
  process.exit(1);
});
