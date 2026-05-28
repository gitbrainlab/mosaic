#!/usr/bin/env tsx
/**
 * Simple autonomous site health check for Mosaic production.
 * Can be run periodically or as part of CI.
 */

import { chromium } from 'playwright';

const PROD_URL = 'https://gitbrainlab.github.io/mosaic/';

async function main() {
  console.log('=== Mosaic Production Health Check ===');
  console.log('URL:', PROD_URL);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();

  const consoleErrors: string[] = [];
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });

  await page.goto(PROD_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await page.waitForTimeout(2000);

  const title = await page.title();
  console.log('Page title:', title);

  const hasGallery = await page.locator('text=Start a Hunt').count() > 0;
  console.log('Gallery/Hunt present:', hasGallery);

  const mapCount = await page.locator('[data-slug]').count();
  console.log('Number of maps in gallery:', mapCount);

  const realErrors = consoleErrors.filter(e => 
    !e.includes('favicon') && !e.includes('analytics')
  );
  console.log('Console errors (filtered):', realErrors.length);

  await browser.close();

  if (!hasGallery || mapCount === 0) {
    console.error('Health check FAILED');
    process.exit(1);
  }

  console.log('Health check PASSED');
}

main().catch(err => {
  console.error('Health check crashed:', err);
  process.exit(1);
});