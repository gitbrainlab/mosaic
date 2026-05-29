import { expect, test, type Page } from '@playwright/test';

async function gotoMap(page: Page, slug: string, entry?: string) {
  const entryParam = entry ? `&entry=${entry}` : '';
  await page.goto(`/mosaic/v3/?/map/${slug}${entryParam}`);
  await page.waitForSelector('#map', { timeout: 15000 });
  await page.waitForTimeout(1600);
}

function channel(value: string) {
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!match) return [0, 0, 0];
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function luminance([r, g, b]: number[]) {
  const normalized = [r, g, b].map(value => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * normalized[0] + 0.7152 * normalized[1] + 0.0722 * normalized[2];
}

function contrastRatio(foreground: string, background: string) {
  const a = luminance(channel(foreground));
  const b = luminance(channel(background));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

test.describe('@smoke UI hardening checks', () => {
  test('dark mobile list sheet rows are readable', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-dark', 'Dark contrast check only runs in mobile-dark.');

    await gotoMap(page, 'upside-down-pizza');
    await page.locator('#show-list-header').click();
    const firstRow = page.locator('#mobile-list .entry').first();
    await expect(firstRow).toBeVisible({ timeout: 8000 });

    const contrast = await firstRow.evaluate(row => {
      const title = row.querySelector('div:first-child') as HTMLElement;
      const subtitle = row.querySelector('div:nth-child(2)') as HTMLElement;
      const rowStyle = getComputedStyle(row);
      const titleStyle = getComputedStyle(title);
      const subtitleStyle = getComputedStyle(subtitle);
      return {
        background: rowStyle.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(row.closest('[class*="bg-"]') || document.body).backgroundColor : rowStyle.backgroundColor,
        title: titleStyle.color,
        subtitle: subtitleStyle.color,
      };
    });

    expect(contrastRatio(contrast.title, contrast.background)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(contrast.subtitle, contrast.background)).toBeGreaterThanOrEqual(4.5);
  });

  test('mobile search has explicit empty state and reset action', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Mobile empty state check runs once.');

    await gotoMap(page, 'regional-folk-traditions');
    await page.locator('#show-list-header').click();
    await page.locator('#mobile-search').fill('zz-no-results');

    await expect(page.locator('#mobile-list').getByText(/No results/i)).toBeVisible();
    await expect(page.locator('#mobile-list').getByRole('button', { name: /Reset search/i })).toBeVisible();
    await expect(page).toHaveURL(/q=zz-no-results/);

    await page.locator('#mobile-list').getByRole('button', { name: /Reset search/i }).click();
    await expect(page.locator('#mobile-list .entry').first()).toBeVisible();
  });

  test('search matches attributes and evidence-backed terms', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'Desktop search predicate check runs once.');

    await gotoMap(page, 'regional-folk-traditions');
    await page.locator('#search').fill('craft');

    await expect(page.locator('#entry-list .entry-row').first()).toBeVisible();
    await expect(page.getByText('Appalachian Dulcimer Making')).toBeVisible();
  });

  test('non-product maps do not show product-photo copy', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'No-photo copy check runs once.');

    await gotoMap(page, 'modernist-architecture', 'ma-001');

    await expect(page.getByText('Visual documentation in progress')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/product photos/i)).toHaveCount(0);
  });

  test('map header controls meet 44px hit target', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Touch target check runs once.');

    await gotoMap(page, 'ice-cream-capital-district');
    const boxes = await Promise.all([
      page.locator('#back-btn').boundingBox(),
      page.locator('#show-list-header').boundingBox(),
    ]);

    for (const box of boxes) {
      expect(box?.height).toBeGreaterThanOrEqual(44);
      expect(box?.width).toBeGreaterThanOrEqual(44);
    }
  });

  test('detail exposes next nearby action and updates selected entry', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Nearby action check runs once.');

    await gotoMap(page, 'upside-down-pizza');
    await page.locator('#show-list-header').click();
    await page.locator('#mobile-list .entry').first().click();
    await expect(page.getByRole('button', { name: /Next nearby/i })).toBeVisible({ timeout: 8000 });

    const before = new URL(page.url()).searchParams.get('entry');
    await page.getByRole('button', { name: /Next nearby/i }).click();
    await page.waitForTimeout(700);
    const after = new URL(page.url()).searchParams.get('entry');

    expect(after).toBeTruthy();
    expect(after).not.toEqual(before);
  });

  test('first load has a visible marker in the map viewport', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Visible marker geometry check runs once.');

    await gotoMap(page, 'modernist-architecture');
    await page.waitForSelector('.maplibregl-marker', { timeout: 10000 });

    const visibleMarkerCount = await page.evaluate(() => {
      const map = document.querySelector('#map')?.getBoundingClientRect();
      if (!map) return 0;
      return Array.from(document.querySelectorAll('.maplibregl-marker')).filter(marker => {
        const rect = marker.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;
        return centerX >= map.left && centerX <= map.right && centerY >= map.top && centerY <= map.bottom;
      }).length;
    });

    expect(visibleMarkerCount).toBeGreaterThanOrEqual(1);
  });

  test('studio exposes static verification queue actions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Studio queue check runs once.');

    await page.goto('/mosaic/v3/?/studio');
    await expect(page.getByRole('button', { name: /Verification Queue/i })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('button', { name: /Needs Photo Review/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Refinement Requested/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Approved / Committed' })).toBeVisible();
    await expect(page.getByText('Review rule: exact place')).toBeVisible();
    const activePreview = page.locator('[data-review-preview]:not([hidden])');
    await expect(activePreview.getByText('Profile Preview')).toBeVisible();
    await expect(activePreview.getByText('What to Assess')).toBeVisible();

    const secondCard = page.locator('[data-review-card]').nth(1);
    await expect(secondCard).toBeVisible();
    await secondCard.click();
    await expect(secondCard).toHaveAttribute('aria-pressed', 'true');

    const action = activePreview.locator('[data-review-action]').first();
    await expect(action).toBeVisible();
    await action.click();
    await expect(page.locator('#studio-action-payload')).toContainText(/"targetState"/);
    await expect(page.locator('#studio-action-payload')).toContainText(/"entryId"/);
    await expect(page.getByRole('button', { name: /Copy payload/i })).toBeEnabled();
    await page.getByRole('button', { name: /Clear/i }).click();
    await expect(page.locator('#studio-action-payload')).toContainText('Choose a next-stage action');
  });
});
