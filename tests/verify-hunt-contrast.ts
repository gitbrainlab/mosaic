/**
 * Comprehensive contrast + UX flow verification for Mosaic Hunt demo.
 * Captures gallery, hunt simulation states, and map interactions across viewports + color schemes.
 */
import { chromium, type Browser, type Page } from 'playwright';
import { mkdirSync } from 'fs';

const VIEWPORTS = [
  { name: 'mobile', width: 375, height: 812 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'desktop', width: 1280, height: 800 },
];

const SCHEMES: ('light' | 'dark')[] = ['dark', 'light'];

async function setupPage(browser: Browser, vp: { name: string; width: number; height: number }, scheme: 'light' | 'dark') {
  const context = await browser.newContext({
    viewport: { width: vp.width, height: vp.height },
    colorScheme: scheme,
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();
  return { page, context };
}

async function screenshot(page: Page, name: string) {
  await page.waitForTimeout(120);
  await page.screenshot({ path: `tests/screenshots/${name}.png`, fullPage: true });
  console.log(`  ✓ ${name}.png`);
}

async function runHuntFlow(page: Page, vpName: string, scheme: string) {
  const prefix = `${vpName}-${scheme}`;

  // 1. Gallery / Hunt launcher (main complaint area)
  await page.goto('http://localhost:5173/');
  await page.waitForTimeout(400);
  await screenshot(page, `${prefix}-gallery-hunt`);

  // 2. Launch hunt (default topic)
  await page.locator('#launch-hunt').click();
  await page.waitForTimeout(900); // mid-animation: jobs lighting up, research starting
  await screenshot(page, `${prefix}-hunt-mid`);

  // 3. Wait for full simulation to complete
  await page.waitForTimeout(4800);
  await screenshot(page, `${prefix}-hunt-complete`);

  // 4. Open the resulting map
  await page.locator('#view-map-btn').click();
  await page.waitForTimeout(1100);
  await screenshot(page, `${prefix}-map-from-hunt`);

  // 5. Interact: open mobile list (if visible) or use desktop list, click an entry
  const showListBtn = page.locator('#show-list');
  if (await showListBtn.isVisible().catch(() => false)) {
    await showListBtn.click();
    await page.waitForTimeout(400);
    await screenshot(page, `${prefix}-map-list-sheet-open`);

    // Click first entry in the mobile sheet
    const firstEntry = page.locator('#mobile-list .entry').first();
    if (await firstEntry.isVisible().catch(() => false)) {
      await firstEntry.click();
      await page.waitForTimeout(700);
      await screenshot(page, `${prefix}-map-sheet-detail-from-list`);
    }
  } else {
    // Desktop: click a list row
    const firstRow = page.locator('#entry-list .entry-row').first();
    if (await firstRow.isVisible().catch(() => false)) {
      await firstRow.click();
      await page.waitForTimeout(700);
      await screenshot(page, `${prefix}-map-sheet-detail-from-list`);
    }
  }

  // 6. Apply a filter (high confidence)
  const highBtn = page.locator('.filter-btn[data-filter="high"]');
  if (await highBtn.isVisible().catch(() => false)) {
    await highBtn.click();
    await page.waitForTimeout(250);
    await screenshot(page, `${prefix}-map-filter-high`);
  }

  // Close any open sheet to clean up
  const closeX = page.locator('button:has-text("×")').first();
  if (await closeX.isVisible().catch(() => false)) {
    await closeX.click();
    await page.waitForTimeout(200);
  }
}

async function main() {
  console.log('Starting comprehensive Hunt + contrast verification...\n');
  mkdirSync('tests/screenshots', { recursive: true });

  const browser = await chromium.launch({ headless: true });

  for (const vp of VIEWPORTS) {
    for (const scheme of SCHEMES) {
      console.log(`\n=== ${vp.name} @ ${scheme} ===`);
      const { page, context } = await setupPage(browser, vp, scheme);

      try {
        await runHuntFlow(page, vp.name, scheme);
      } catch (err) {
        console.error(`  Error in ${vp.name}-${scheme}:`, err);
        await page.screenshot({ path: `tests/screenshots/${vp.name}-${scheme}-ERROR.png`, fullPage: true });
      }

      await context.close();
    }
  }

  await browser.close();
  console.log('\n✅ All verification runs complete. Screenshots in tests/screenshots/');
}

main().catch(console.error);