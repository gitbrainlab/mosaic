import { expect, test, type Page } from '@playwright/test';

async function gotoMap(page: Page, slug: string, entry?: string) {
  const entryParam = entry ? `&entry=${entry}` : '';
  await page.goto(`/mosaic/v4/?/map/${slug}${entryParam}`);
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

  test('desktop sidebar entries are keyboard-operable buttons', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'Desktop sidebar accessibility check runs once.');

    await gotoMap(page, 'upside-down-pizza');
    const firstEntry = page.locator('#entry-list .entry-row').first();
    await expect(firstEntry).toBeVisible({ timeout: 8000 });
    await expect(firstEntry).toHaveJSProperty('tagName', 'BUTTON');
    await expect(firstEntry).toHaveAttribute('aria-label', /Open .+ in .+/);

    await firstEntry.focus();
    await expect(firstEntry).toBeFocused();
    await page.keyboard.press('Enter');

    await expect(page.locator('[data-component="desktop-detail-panel"]')).toBeVisible({ timeout: 8000 });
    expect(new URL(page.url()).searchParams.get('entry')).toBeTruthy();
  });

  test('non-product maps do not show product-photo copy', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'No-photo copy check runs once.');

    await gotoMap(page, 'modernist-architecture', 'ma-001');

    await expect(page.getByText('Visual documentation in progress')).toBeVisible({ timeout: 8000 });
    await expect(page.getByText('Photo standard')).toBeVisible();
    await expect(page.getByText(/canonical building images/i)).toBeVisible();
    await expect(page.getByText(/Target: Villa Savoye in Poissy/i)).toBeVisible();
    await expect(page.getByText(/product photos/i)).toHaveCount(0);
  });

  test('photo-rich details pair photos with trust cues', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Photo provenance check runs once.');

    await gotoMap(page, 'ice-cream-nationwide-albany-radial', 'saratoga-gelato-saratoga-springs-ny');

    await expect(page.locator('[data-photo-trust-cue]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/Source: Official Saratoga Gelato website/i).first()).toBeVisible();
    await expect(page.getByText(/Type: Product/i).first()).toBeVisible();
  });

  test('unavailable detail photos keep provenance visible', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Photo fallback check runs once.');

    await page.route('**/images/stracciatella.jpg', route => route.abort());
    await gotoMap(page, 'ice-cream-nationwide-albany-radial', 'saratoga-gelato-saratoga-springs-ny');

    await expect(page.locator('[data-photo-unavailable]').first()).toBeVisible({ timeout: 8000 });
    await expect(page.getByText(/route this image through photo review/i).first()).toBeVisible();
    await expect(page.getByText(/Source: Official Saratoga Gelato website/i).first()).toBeVisible();
    await expect(page.getByText(/Type: Product/i).first()).toBeVisible();
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

  test('mobile detail peek exposes summary and primary actions', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Mobile detail peek contract runs once.');

    await gotoMap(page, 'ice-cream-nationwide-albany-radial', 'saratoga-gelato-saratoga-springs-ny');

    const sheet = page.locator('[data-component="bottom-sheet"]').first();
    const summary = sheet.locator('[data-detail-snap-contract]');
    await expect(sheet).toBeVisible({ timeout: 8000 });
    await expect(summary).toBeVisible();
    await expect(summary.getByText('Saratoga Springs, NY', { exact: true })).toBeVisible();
    await expect(summary.getByText('Confidence')).toBeVisible();
    await expect(summary.getByText('Visual evidence ready')).toBeVisible();
    await expect(sheet.locator('[data-detail-actions]')).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Next nearby/i })).toBeVisible();

    const geometry = await sheet.evaluate(element => {
      const sheetRect = element.getBoundingClientRect();
      const summaryRect = element.querySelector('[data-detail-snap-contract]')?.getBoundingClientRect();
      const actionsRect = element.querySelector('[data-detail-actions]')?.getBoundingClientRect();

      return {
        summaryVisibleInPeek: Boolean(summaryRect && summaryRect.top >= sheetRect.top && summaryRect.bottom <= sheetRect.bottom),
        actionsVisibleInPeek: Boolean(actionsRect && actionsRect.top >= sheetRect.top && actionsRect.bottom <= sheetRect.bottom),
      };
    });

    expect(geometry.summaryVisibleInPeek).toBe(true);
    expect(geometry.actionsVisibleInPeek).toBe(true);
  });

  test('mobile detail sheet exposes dialog semantics and keyboard dismissal', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Mobile accessibility contract runs once.');

    await gotoMap(page, 'ice-cream-nationwide-albany-radial', 'saratoga-gelato-saratoga-springs-ny');

    const sheet = page.getByRole('dialog', { name: /Saratoga Gelato/i });
    await expect(sheet).toBeVisible({ timeout: 8000 });
    await expect(sheet).toHaveAttribute('aria-modal', 'false');

    const activeComponent = await page.evaluate(() => (document.activeElement as HTMLElement | null)?.dataset.component);
    expect(activeComponent).toBe('bottom-sheet');

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-component="bottom-sheet"]')).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get('entry')).toBeNull();
  });

  test('modal mobile list sheet keeps keyboard focus contained', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Modal focus loop check runs once.');

    await gotoMap(page, 'upside-down-pizza');
    await page.locator('#show-list-header').click();

    const sheet = page.getByRole('dialog', { name: 'Entries' });
    const closeButton = sheet.getByRole('button', { name: /Close details/i });
    const search = sheet.getByPlaceholder('Search entries...');
    const firstEntry = sheet.locator('#mobile-list .entry').first();
    const lastEntry = sheet.locator('#mobile-list .entry').last();

    await expect(sheet).toBeVisible({ timeout: 8000 });
    await expect(sheet).toHaveAttribute('aria-modal', 'true');
    await expect(firstEntry).toHaveJSProperty('tagName', 'BUTTON');
    await expect(firstEntry).toHaveAttribute('aria-label', /Open .+ in .+/);

    await closeButton.focus();
    await page.keyboard.press('Shift+Tab');
    await expect(lastEntry).toBeFocused();

    await page.keyboard.press('Tab');
    await expect(closeButton).toBeFocused();

    await search.focus();
    await page.keyboard.press('Tab');
    await expect(firstEntry).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(sheet).toHaveCount(0);
    await expect(page.locator('[data-component="bottom-sheet"][aria-modal="false"]')).toBeVisible({ timeout: 8000 });
    expect(new URL(page.url()).searchParams.get('entry')).toBeTruthy();

    await page.keyboard.press('Escape');
    await expect(page.locator('[data-component="bottom-sheet"]')).toHaveCount(0);
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

    await page.goto('/mosaic/v4/?/studio');
    await expect(page.getByRole('heading', { name: 'Verification Queue' })).toBeVisible({ timeout: 15000 });
    await expect(page.getByRole('heading', { name: 'Needs Photo Review' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Refinement Requested' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Approved / Committed' })).toBeVisible();
    await expect(page.getByText('Select a card')).toBeVisible();
    await expect(page.getByText('Inspect the preview')).toBeVisible();
    const activePreview = page.locator('[data-review-preview]:not([hidden])');
    await expect(activePreview.getByText('Current review path')).toBeVisible();
    await expect(activePreview.getByRole('link', { name: /Open selected map detail/i })).toBeVisible();
    await expect(activePreview.getByText('Profile Preview')).toBeVisible();
    await expect(activePreview.getByText('What to Assess')).toBeVisible();
    await expect(page.getByRole('button', { name: /Change curator key/i })).toBeVisible();

    const secondCard = page.locator('[data-review-card]').nth(1);
    await expect(secondCard).toBeVisible();
    await secondCard.click();
    await expect(secondCard).toHaveAttribute('aria-pressed', 'true');

    const action = activePreview.locator('[data-review-action]').first();
    await expect(action).toBeVisible();
    await action.click();
    await expect(page.locator('#studio-action-payload')).toContainText(/"targetState"/);
    await expect(page.locator('#studio-action-payload')).toContainText(/"actionType"/);
    await expect(page.locator('#studio-action-payload')).toContainText(/"actionMode": "live"/);
    await expect(page.locator('#studio-action-payload')).toContainText(/"entryId"/);
    await page.getByLabel('Batch promotion').check();
    await expect(page.locator('#studio-action-payload')).toContainText(/"actionMode": "batch"/);
    await expect(page.getByRole('button', { name: /Submit action/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: /Copy payload/i })).toBeEnabled();
    await page.getByRole('button', { name: /Clear/i }).click();
    await expect(page.locator('#studio-action-payload')).toContainText('Choose a next-stage action');
  });

  test('studio review path opens the selected entry on the map', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile-light', 'Studio to map path check runs once.');

    await page.goto('/mosaic/v4/?/studio');
    await expect(page.getByRole('heading', { name: 'Curation Dashboard' })).toBeVisible({ timeout: 15000 });

    const secondCard = page.locator('[data-review-card]').nth(1);
    await expect(secondCard).toBeVisible();
    await secondCard.click();
    const selectedKey = await secondCard.getAttribute('data-review-key');
    expect(selectedKey).toBeTruthy();
    const [, entryId] = selectedKey!.split(':');

    const activePreview = page.locator('[data-review-preview]:not([hidden])');
    await expect(activePreview.locator('[data-current-review-path]')).toBeVisible();
    await activePreview.getByRole('link', { name: /Open selected map detail/i }).click();

    await expect(page).toHaveURL(new RegExp(`/map/.+entry=${entryId}`));
    await expect(page.locator('#map')).toBeVisible({ timeout: 15000 });
  });

  test('studio shows live enrichment controls only where relevant', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop-light', 'Studio enrichment check runs once.');

    await page.goto('/mosaic/v4/?/studio');
    await expect(page.getByRole('heading', { name: 'Curation Dashboard' })).toBeVisible({ timeout: 15000 });

    const photoSection = page.locator('[data-queue-section="Needs Photo Review"]');
    const firstPhotoCard = photoSection.locator('[data-review-card]').first();
    await expect(firstPhotoCard).toBeVisible();
    await firstPhotoCard.click();

    const activePreview = page.locator('[data-review-preview]:not([hidden])');
    await expect(activePreview.getByRole('button', { name: /Find real photos/i })).toBeVisible();
    await expect(activePreview.getByRole('button', { name: /Enrich evidence/i })).toBeVisible();
    await expect(activePreview.getByRole('button', { name: /Verify address/i })).toBeVisible();

    const verificationSection = page.locator('[data-queue-section="Verification Queue"]');
    const firstVerificationCard = verificationSection.locator('[data-review-card]').first();
    if (await firstVerificationCard.count()) {
      await firstVerificationCard.click();
      await expect(activePreview.getByRole('button', { name: /Enrich evidence/i })).toBeVisible();
      await expect(activePreview.getByRole('button', { name: /Find real photos/i })).toHaveCount(0);
    }
  });
});
