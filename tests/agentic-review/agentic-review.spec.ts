import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'fs';
import { join, resolve } from 'path';
import {
  defaultReviewBaseURL,
  reviewArtifactsRoot,
  reviewJourneys,
  type ReviewJourney,
  type ReviewProjectKind,
  type ReviewStep,
} from './config';

interface StepRecord {
  kind: ReviewStep['kind'];
  name?: string;
  selector?: string;
  note?: string;
  passed: boolean;
  details?: string;
  path?: string;
}

interface JourneyResult {
  journeyId: string;
  title: string;
  persona: ReviewJourney['persona'];
  priority: ReviewJourney['priority'];
  project: string;
  projectKind: ReviewProjectKind;
  baseURL: string;
  routeHint: string;
  startedAt: string;
  endedAt: string;
  finalURL: string;
  viewport: unknown;
  colorScheme: unknown;
  expectations: string[];
  inspiration: string[];
  panelQuestions: string[];
  steps: StepRecord[];
}

test.describe('@agentic Mosaic agentic review harness', () => {
  test.describe.configure({ mode: 'serial' });

  for (const journey of reviewJourneys) {
    test(`${journey.priority} ${journey.id} @agentic`, async ({ page }, testInfo) => {
      const projectKind = projectKindFromName(testInfo.project.name);

      test.skip(
        !testInfo.project.name.startsWith('agentic-review'),
        'Agentic journeys only run in agentic-review Playwright projects.',
      );
      test.skip(
        !!journey.when && !journey.when.includes(projectKind),
        'Journey does not apply to this viewport family.',
      );

      const baseURL = normalizeBaseURL(String(testInfo.project.use.baseURL || process.env.MOSAIC_REVIEW_BASE_URL || defaultReviewBaseURL));
      const projectDir = artifactDir(testInfo.project.name);
      mkdirSync(projectDir, { recursive: true });

      const result: JourneyResult = {
        journeyId: journey.id,
        title: journey.title,
        persona: journey.persona,
        priority: journey.priority,
        project: testInfo.project.name,
        projectKind,
        baseURL,
        routeHint: journey.routeHint,
        startedAt: new Date().toISOString(),
        endedAt: '',
        finalURL: '',
        viewport: testInfo.project.use.viewport,
        colorScheme: testInfo.project.use.colorScheme,
        expectations: journey.expectations,
        inspiration: journey.inspiration,
        panelQuestions: journey.panelQuestions,
        steps: [],
      };

      for (const step of journey.steps) {
        if (step.when && !step.when.includes(projectKind)) continue;
        const record = await runStep(page, testInfo, journey, step, projectDir, baseURL);
        result.steps.push(record);
      }

      result.endedAt = new Date().toISOString();
      result.finalURL = page.url();

      const resultPath = join(projectDir, `${journey.id}.json`);
      writeFileSync(resultPath, `${JSON.stringify(result, null, 2)}\n`);
      await testInfo.attach(`${journey.id}-result`, {
        path: resultPath,
        contentType: 'application/json',
      });
    });
  }
});

async function runStep(
  page: Page,
  testInfo: TestInfo,
  journey: ReviewJourney,
  step: ReviewStep,
  projectDir: string,
  baseURL: string,
): Promise<StepRecord> {
  const baseRecord = {
    kind: step.kind,
    note: 'note' in step ? step.note : undefined,
  };

  try {
    switch (step.kind) {
      case 'goto': {
        const url = resolveRoute(baseURL, step.route);
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        return { ...baseRecord, passed: true, details: url };
      }

      case 'click': {
        await page.locator(step.selector).first().click({ timeout: step.optional ? 1500 : 8000 });
        return { ...baseRecord, selector: step.selector, passed: true };
      }

      case 'clickNth': {
        await page.locator(step.selector).nth(step.index).click({ timeout: step.optional ? 1500 : 8000 });
        return {
          ...baseRecord,
          selector: step.selector,
          passed: true,
          details: `index ${step.index}`,
        };
      }

      case 'fill': {
        await page.locator(step.selector).first().fill(step.value, { timeout: step.optional ? 1500 : 8000 });
        return { ...baseRecord, selector: step.selector, passed: true };
      }

      case 'press': {
        await page.keyboard.press(step.key);
        return { ...baseRecord, passed: true, details: step.key };
      }

      case 'wait': {
        await page.waitForTimeout(step.ms);
        return { ...baseRecord, passed: true, details: `${step.ms}ms` };
      }

      case 'hardExpectVisible': {
        await expect(page.locator(step.selector).first()).toBeVisible({ timeout: step.timeout || 8000 });
        return { ...baseRecord, selector: step.selector, passed: true };
      }

      case 'checkVisible': {
        const visible = await page.locator(step.selector).first().isVisible({ timeout: step.timeout || 1200 }).catch(() => false);
        return {
          ...baseRecord,
          selector: step.selector,
          passed: visible,
          details: visible ? 'visible' : 'not visible',
        };
      }

      case 'checkAnyVisible': {
        const visibleSelectors: string[] = [];
        for (const selector of step.selectors) {
          const visible = await page.locator(selector).first().isVisible({ timeout: step.timeout || 900 }).catch(() => false);
          if (visible) visibleSelectors.push(selector);
        }
        return {
          ...baseRecord,
          selector: step.selectors.join(', '),
          passed: visibleSelectors.length > 0,
          details: visibleSelectors.length > 0 ? `visible: ${visibleSelectors.join(', ')}` : 'none visible',
        };
      }

      case 'checkCountAtLeast': {
        await page.waitForSelector(step.selector, { timeout: step.timeout || 1500 }).catch(() => undefined);
        const count = await page.locator(step.selector).count();
        return {
          ...baseRecord,
          selector: step.selector,
          passed: count >= step.count,
          details: `${count} found; expected at least ${step.count}`,
        };
      }

      case 'checkInputValueIncludes': {
        const value = await page.locator(step.selector).first().inputValue({ timeout: step.timeout || 1200 }).catch(() => '');
        return {
          ...baseRecord,
          selector: step.selector,
          passed: value.includes(step.value),
          details: `value "${value}" should include "${step.value}"`,
        };
      }

      case 'checkURLIncludes': {
        const url = page.url();
        return {
          ...baseRecord,
          passed: url.includes(step.value),
          details: `url "${url}" should include "${step.value}"`,
        };
      }

      case 'screenshot': {
        const path = join(projectDir, `${journey.id}-${step.name}.png`);
        await page.screenshot({ path, fullPage: true });
        await testInfo.attach(`${journey.id}-${step.name}`, {
          path,
          contentType: 'image/png',
        });
        return {
          ...baseRecord,
          name: step.name,
          passed: true,
          path: relativeArtifactPath(path),
        };
      }

      case 'snapshot': {
        const snapshot = await collectDomSnapshot(page);
        const path = join(projectDir, `${journey.id}-${step.name}.json`);
        writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
        await testInfo.attach(`${journey.id}-${step.name}`, {
          path,
          contentType: 'application/json',
        });
        return {
          ...baseRecord,
          name: step.name,
          passed: true,
          path: relativeArtifactPath(path),
        };
      }
    }
  } catch (error) {
    if ('optional' in step && step.optional) {
      return {
        ...baseRecord,
        selector: 'selector' in step ? step.selector : undefined,
        passed: false,
        details: error instanceof Error ? error.message : String(error),
      };
    }
    throw error;
  }
}

async function collectDomSnapshot(page: Page) {
  return page.evaluate(() => {
    const text = document.body.innerText.replace(/\s+\n/g, '\n').replace(/[ \t]+/g, ' ').trim();
    const boxFor = (selector: string) => {
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

    return {
      url: window.location.href,
      title: document.title,
      appClass: document.querySelector('#app')?.className || '',
      headerText: document.querySelector('#app-header')?.textContent?.trim() || '',
      routeText: document.querySelector('#map-title')?.textContent?.trim() || document.querySelector('h1')?.textContent?.trim() || '',
      counts: {
        mapCards: document.querySelectorAll('[data-slug]').length,
        mapContainers: document.querySelectorAll('#map').length,
        markers: document.querySelectorAll('.maplibregl-marker').length,
        desktopRows: document.querySelectorAll('#entry-list .entry-row').length,
        mobileRows: document.querySelectorAll('#mobile-list .entry').length,
        bottomSheets: document.querySelectorAll('.fixed.bottom-0.z-\\[300\\]').length,
        desktopPanels: document.querySelectorAll('.fixed.bottom-0.z-\\[250\\]').length,
        images: document.querySelectorAll('img').length,
        noPhotoMessages: Array.from(document.querySelectorAll('body *')).filter(el =>
          (el.textContent || '').includes('Photos sourcing in progress') ||
          (el.textContent || '').includes('Photo unavailable')
        ).length,
      },
      boxes: {
        app: boxFor('#app'),
        map: boxFor('#map'),
        listButton: boxFor('#show-list-header'),
        entryList: boxFor('#entry-list'),
        mobileList: boxFor('#mobile-list'),
      },
      visibleTextExcerpt: text.slice(0, 2400),
    };
  });
}

function normalizeBaseURL(url: string) {
  return url.endsWith('/') ? url : `${url}/`;
}

function resolveRoute(baseURL: string, route: string) {
  return new URL(route, baseURL).toString();
}

function artifactDir(projectName: string) {
  const runId = process.env.MOSAIC_REVIEW_RUN_ID || 'latest';
  return resolve(join(reviewArtifactsRoot, runId, projectName));
}

function relativeArtifactPath(path: string) {
  return path.replace(`${process.cwd()}/`, '');
}

function projectKindFromName(projectName: string): ReviewProjectKind {
  if (projectName.includes('desktop')) return 'desktop';
  if (projectName.includes('tablet')) return 'tablet';
  return 'mobile';
}
