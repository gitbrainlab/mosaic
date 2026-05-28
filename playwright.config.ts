import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Mosaic
 *
 * - Mobile-first (375px is the source of truth)
 * - Light + dark color schemes
 * - Supports both the ad-hoc visual regression scripts (via `npm run test:regression`)
 *   and future real @playwright/test specs
 * - Designed to run locally with `npm test` and in GitHub Actions
 */

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts', // Real Playwright tests live here (future)
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },

  projects: [
    // === Mobile (primary) ===
    {
      name: 'mobile-light',
      use: {
        ...devices['iPhone 14'],
        viewport: { width: 375, height: 812 },
        colorScheme: 'light',
      },
    },
    {
      name: 'mobile-dark',
      use: {
        ...devices['iPhone 14'],
        viewport: { width: 375, height: 812 },
        colorScheme: 'dark',
      },
    },

    // === Tablet ===
    {
      name: 'tablet-light',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 768, height: 1024 },
        colorScheme: 'light',
      },
    },
    {
      name: 'tablet-dark',
      use: {
        ...devices['iPad (gen 7)'],
        viewport: { width: 768, height: 1024 },
        colorScheme: 'dark',
      },
    },

    // === Desktop ===
    {
      name: 'desktop-light',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        colorScheme: 'light',
      },
    },
    {
      name: 'desktop-dark',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 900 },
        colorScheme: 'dark',
      },
    },

    // Production verification projects (run against live site)
    {
      name: 'production-desktop',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: 'https://gitbrainlab.github.io/mosaic/',
        viewport: { width: 1280, height: 900 },
      },
      testMatch: '**/production-verification.spec.ts',
    },
    {
      name: 'production-mobile',
      use: {
        ...devices['iPhone 14'],
        baseURL: 'https://gitbrainlab.github.io/mosaic/',
        viewport: { width: 375, height: 812 },
      },
      testMatch: '**/production-verification.spec.ts',
    },
  ],

  // For the lightweight @smoke tests we automatically start the production preview
  // so `npm run test:smoke` works without the developer having to run `npm run dev` first.
  webServer: {
    command: 'npm run build && npm run preview -- --port 5173 --host 127.0.0.1',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});