/**
 * Quick verification script for Phase 3
 * Run with: npx tsx tests/verify-phase3.ts   (or via playwright)
 *
 * This lets the agent capture what the UI actually looks like.
 */

import { chromium } from '@playwright/test'

async function verify() {
  const browser = await chromium.launch({ headless: true })
  const page = await browser.newPage()

  // Capture console errors and page errors for debugging
  page.on('console', msg => {
    if (msg.type() === 'error') console.log('BROWSER CONSOLE ERROR:', msg.text())
  })
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.message)
  })

  const base = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173'

  console.log('Navigating to gallery...')
  await page.goto(base, { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'tests/screenshots/gallery.png', fullPage: true })
  console.log('Saved gallery.png')

  // Click the first map card
  const firstCard = page.locator('[data-slug]').first()
  await firstCard.waitFor({ state: 'visible', timeout: 8000 })

  const slug = await firstCard.getAttribute('data-slug')
  console.log(`Clicking first map: ${slug}`)
  await firstCard.click()

  // Wait for either the map view to appear or a known error state
  try {
    await page.waitForSelector('#map', { state: 'visible', timeout: 12000 })
    await page.waitForSelector('.maplibregl-marker', { timeout: 12000 })

    await page.waitForTimeout(1000)
    await page.screenshot({ path: 'tests/screenshots/map.png', fullPage: true })
    console.log('Saved map.png')

    const marker = page.locator('.maplibregl-marker').first()
    if (await marker.count() > 0) {
      await marker.click({ force: true })
      await page.waitForTimeout(1200)
      await page.screenshot({ path: 'tests/screenshots/map-with-sheet.png', fullPage: true })
      console.log('Saved map-with-sheet.png')
    }
  } catch (e) {
    console.log('Failed to find map view. Current URL:', page.url())
    await page.screenshot({ path: 'tests/screenshots/map-failed.png', fullPage: true })
    console.log('Saved map-failed.png for debugging')
  }

  await browser.close()
  console.log('Verification complete. Check tests/screenshots/')
}

verify().catch(console.error)