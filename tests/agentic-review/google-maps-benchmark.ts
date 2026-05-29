import { chromium, type Page } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const runId = process.env.MOSAIC_GOOGLE_MAPS_RUN_ID || 'google-maps-iphone16pro-2026-05-29';
const outDir = join('tests/agentic-review/artifacts', runId);
mkdirSync(outDir, { recursive: true });

const iphone16Pro = {
  viewport: { width: 402, height: 874 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
};

interface Snapshot {
  name: string;
  url: string;
  title: string;
  viewport: typeof iphone16Pro.viewport;
  visibleText: string;
  boxes: Record<string, Box | null>;
  notes: string[];
}

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

const snapshots: Snapshot[] = [];

async function main() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...iphone16Pro,
    locale: 'en-US',
    timezoneId: 'America/New_York',
    geolocation: { latitude: 42.748, longitude: -73.802 },
    permissions: ['geolocation'],
  });
  const page = await context.newPage();
  page.setDefaultTimeout(18000);

  await page.goto('https://www.google.com/maps/search/Control+Tower+ice+cream+airport+views/@42.748,-73.802,16z', {
    waitUntil: 'domcontentloaded',
    timeout: 45000,
  });
  await dismissConsent(page);
  await page.waitForTimeout(4500);
  await dismissConsent(page);
  await page.waitForTimeout(900);
  await capture(page, '01-initial-search', [
    'Initial mobile web load after searching for Control Tower.',
    'This may differ from native Google Maps app chrome, but keeps the same mobile viewport and live Maps interaction model.',
  ]);

  await tapLikelyPlace(page);
  await page.waitForTimeout(3000);
  await capture(page, '02-place-selected', [
    'After selecting the most likely place/result.',
    'Used to inspect the map-to-place progressive disclosure handoff.',
  ]);

  await dragSheet(page, -250);
  await page.waitForTimeout(1200);
  await capture(page, '03-sheet-expanded', [
    'After upward drag on the place surface.',
    'Used to evaluate scroll/expand transition and balance between map and place view.',
  ]);

  await horizontalPhotoScroll(page);
  await page.waitForTimeout(1000);
  await capture(page, '04-photo-row-scroll', [
    'After attempting horizontal scroll on visible media row.',
    'Used to inspect image rail behavior and information scale.',
  ]);

  writeFileSync(join(outDir, 'google-maps-benchmark.json'), `${JSON.stringify({ runId, device: iphone16Pro, snapshots }, null, 2)}\n`);
  await browser.close();
  console.log(`Google Maps benchmark artifacts: ${outDir}`);
}

async function dismissConsent(page: Page) {
  const consentButtons = [
    'button:has-text("Go back to web")',
    'text=Go back to web',
    'button:has-text("Accept all")',
    'button:has-text("I agree")',
    'button:has-text("Reject all")',
    'text=Accept all',
    'text=I agree',
  ];

  for (const selector of consentButtons) {
    const button = page.locator(selector).first();
    if (await button.isVisible({ timeout: 1200 }).catch(() => false)) {
      await button.click({ force: true }).catch(() => undefined);
      await page.waitForTimeout(1200);
      return;
    }
  }

  await page.evaluate(`
    (() => {
      const candidates = Array.from(document.querySelectorAll('button, [role="button"], div, span'));
      const target = candidates.find((el) => (el.textContent || '').trim() === 'Go back to web');
      if (target) target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    })()
  `).catch(() => undefined);
}

async function tapLikelyPlace(page: Page) {
  const candidates = [
    'text=Control Tower',
    '[aria-label*="Control Tower"]',
    'a[href*="Control"]',
    'div[role="article"]',
  ];

  for (const selector of candidates) {
    const target = page.locator(selector).first();
    if (await target.isVisible({ timeout: 1800 }).catch(() => false)) {
      await target.tap({ timeout: 3000 }).catch(async () => {
        await target.click({ timeout: 3000 }).catch(() => undefined);
      });
      return;
    }
  }
}

async function dragSheet(page: Page, deltaY: number) {
  const startX = iphone16Pro.viewport.width / 2;
  const startY = iphone16Pro.viewport.height - 160;
  await page.touchscreen.tap(startX, startY).catch(() => undefined);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(startX, startY + deltaY, { steps: 12 });
  await page.mouse.up();
}

async function horizontalPhotoScroll(page: Page) {
  const startX = iphone16Pro.viewport.width - 80;
  const startY = Math.round(iphone16Pro.viewport.height * 0.72);
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.mouse.move(70, startY, { steps: 12 });
  await page.mouse.up();
}

async function capture(page: Page, name: string, notes: string[]) {
  const screenshotPath = join(outDir, `${name}.png`);
  await page.screenshot({ path: screenshotPath, fullPage: false });
  const snapshot = await page.evaluate(`
    (() => {
      const boxFor = (selector) => {
        const el = document.querySelector(selector);
        if (!el) return null;
        const rect = el.getBoundingClientRect();
        return {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      };

      const text = document.body.innerText.replace(/\\s+/g, ' ').trim();

      return {
        name: ${JSON.stringify(name)},
        url: window.location.href,
        title: document.title,
        viewport: { width: window.innerWidth, height: window.innerHeight },
        visibleText: text.slice(0, 2500),
        boxes: {
          searchBox: boxFor('input[aria-label], input[name="q"], form input'),
          app: boxFor('body'),
          firstButton: boxFor('button'),
          firstImage: boxFor('img'),
          firstScrollable: boxFor('[role="main"], [role="region"], div[aria-label]'),
        },
        notes: [],
      };
    })()
  `) as Snapshot;

  snapshot.notes = notes;
  snapshots.push(snapshot);
  writeFileSync(join(outDir, `${name}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
