import { expect, test, type Page } from '@playwright/test';

const DETAIL_URL = '/mosaic/v3/?/map/upside-down-pizza&entry=big-jays-pizzeria-rome-marcy-ny';

type ViewportCase = {
  name: string;
  portrait: { width: number; height: number };
  landscape: { width: number; height: number };
  minVisibleMapHeight: number;
};

const mobileViewports: ViewportCase[] = [
  {
    name: 'iPhone SE',
    portrait: { width: 375, height: 667 },
    landscape: { width: 667, height: 375 },
    minVisibleMapHeight: 150,
  },
  {
    name: 'iPhone 14',
    portrait: { width: 390, height: 844 },
    landscape: { width: 844, height: 390 },
    minVisibleMapHeight: 170,
  },
  {
    name: 'Pixel 7',
    portrait: { width: 412, height: 915 },
    landscape: { width: 915, height: 412 },
    minVisibleMapHeight: 180,
  },
];

const tabletViewports: ViewportCase[] = [
  {
    name: 'iPad portrait/landscape',
    portrait: { width: 768, height: 1024 },
    landscape: { width: 1024, height: 768 },
    minVisibleMapHeight: 260,
  },
];

async function gotoSelectedEntry(page: Page) {
  await page.goto(DETAIL_URL);
  await page.waitForSelector('#map', { timeout: 15000 });
  await page.waitForSelector('.maplibregl-marker', { timeout: 15000 });
  await page.waitForTimeout(1200);
}

async function assertNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return Math.ceil(root.scrollWidth - root.clientWidth);
  });

  expect(overflow).toBeLessThanOrEqual(1);
}

async function assertCanvasIsCrisp(page: Page) {
  const canvas = await page.evaluate(() => {
    const node = document.querySelector<HTMLCanvasElement>('.maplibregl-canvas');
    if (!node) return null;
    const rect = node.getBoundingClientRect();
    return {
      cssWidth: rect.width,
      cssHeight: rect.height,
      backingWidth: node.width,
      backingHeight: node.height,
      dpr: window.devicePixelRatio || 1,
    };
  });

  expect(canvas).not.toBeNull();
  if (!canvas) return;

  const expectedRatio = Math.min(canvas.dpr, 2);
  expect(canvas.backingWidth).toBeGreaterThanOrEqual(canvas.cssWidth * expectedRatio * 0.82);
  expect(canvas.backingHeight).toBeGreaterThanOrEqual(canvas.cssHeight * expectedRatio * 0.82);
}

async function assertMobileMapAndSheetGeometry(page: Page, minVisibleMapHeight: number) {
  const geometry = await page.evaluate(() => {
    const map = document.querySelector('#map')?.getBoundingClientRect();
    const sheet = document.querySelector('[data-component="bottom-sheet"]')?.getBoundingClientRect();
    const markerRects = Array.from(document.querySelectorAll('.maplibregl-marker'))
      .map(marker => marker.getBoundingClientRect())
      .map(rect => ({
        x: rect.left + rect.width / 2,
        y: rect.top + rect.height / 2,
      }));

    if (!map || !sheet) return null;

    const visibleMarkersAboveSheet = markerRects.filter(marker => {
      return (
        marker.x >= map.left &&
        marker.x <= map.right &&
        marker.y >= map.top &&
        marker.y <= sheet.top - 8
      );
    }).length;

    return {
      mapTop: map.top,
      mapBottom: map.bottom,
      mapHeight: map.height,
      sheetTop: sheet.top,
      sheetBottom: sheet.bottom,
      sheetHeight: sheet.height,
      viewportHeight: window.innerHeight,
      visibleMapHeight: sheet.top - map.top,
      visibleMarkersAboveSheet,
    };
  });

  expect(geometry).not.toBeNull();
  if (!geometry) return;

  expect(geometry.mapHeight).toBeGreaterThan(220);
  expect(geometry.visibleMapHeight).toBeGreaterThanOrEqual(minVisibleMapHeight);
  expect(geometry.sheetTop).toBeGreaterThan(geometry.mapTop + minVisibleMapHeight);
  expect(geometry.sheetBottom).toBeLessThanOrEqual(geometry.viewportHeight + 2);
  expect(geometry.visibleMarkersAboveSheet).toBeGreaterThanOrEqual(1);
}

async function assertDesktopGeometry(page: Page) {
  const geometry = await page.evaluate(() => {
    const map = document.querySelector('#map')?.getBoundingClientRect();
    const panel = document.querySelector('[data-component="desktop-detail-panel"]')?.getBoundingClientRect();

    if (!map || !panel) return null;
    return {
      mapHeight: map.height,
      panelTop: panel.top,
      visibleMapHeight: panel.top - map.top,
      viewportHeight: window.innerHeight,
    };
  });

  expect(geometry).not.toBeNull();
  if (!geometry) return;

  expect(geometry.mapHeight).toBeGreaterThan(500);
  expect(geometry.visibleMapHeight).toBeGreaterThan(320);
  expect(geometry.panelTop).toBeLessThan(geometry.viewportHeight);
}

test.describe('@responsive map viewport regression', () => {
  for (const viewportCase of mobileViewports) {
    test(`mobile detail stays responsive through rotation on ${viewportCase.name}`, async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('mobile-'), 'Mobile geometry runs on mobile projects.');

      await page.setViewportSize(viewportCase.portrait);
      await gotoSelectedEntry(page);
      await assertMobileMapAndSheetGeometry(page, viewportCase.minVisibleMapHeight);
      await assertCanvasIsCrisp(page);
      await assertNoHorizontalOverflow(page);

      await page.setViewportSize(viewportCase.landscape);
      await page.waitForTimeout(900);
      await assertMobileMapAndSheetGeometry(page, 118);
      await assertCanvasIsCrisp(page);
      await assertNoHorizontalOverflow(page);
    });
  }

  for (const viewportCase of tabletViewports) {
    test(`tablet detail stays responsive through rotation on ${viewportCase.name}`, async ({ page }, testInfo) => {
      test.skip(!testInfo.project.name.startsWith('mobile-'), 'Tablet geometry runs through mobile Chromium projects in local CI.');

      await page.setViewportSize(viewportCase.portrait);
      await gotoSelectedEntry(page);
      await assertMobileMapAndSheetGeometry(page, viewportCase.minVisibleMapHeight);
      await assertCanvasIsCrisp(page);
      await assertNoHorizontalOverflow(page);

      await page.setViewportSize(viewportCase.landscape);
      await page.waitForTimeout(900);
      await assertMobileMapAndSheetGeometry(page, 240);
      await assertCanvasIsCrisp(page);
      await assertNoHorizontalOverflow(page);
    });
  }

  test('desktop detail keeps the map readable and crisp', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'Desktop geometry runs once.');

    await page.setViewportSize({ width: 1440, height: 960 });
    await gotoSelectedEntry(page);
    await assertDesktopGeometry(page);
    await assertCanvasIsCrisp(page);
    await assertNoHorizontalOverflow(page);
  });

  test('list and detail sheets do not stack on mobile', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Sheet stacking regression runs once.');

    await page.setViewportSize({ width: 390, height: 844 });
    await gotoSelectedEntry(page);
    await expect(page.locator('[data-component="bottom-sheet"]')).toHaveCount(1);

    await page.getByRole('button', { name: /Nearby entries/i }).click();
    await page.waitForTimeout(350);
    await expect(page.locator('[data-component="bottom-sheet"]')).toHaveCount(1);
    await expect(page.locator('#mobile-list .entry').first()).toBeVisible();

    await page.locator('#mobile-list .entry').first().click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-component="bottom-sheet"]')).toHaveCount(1);
    await expect(page.getByRole('button', { name: /Next nearby/i })).toBeVisible();
  });
});
