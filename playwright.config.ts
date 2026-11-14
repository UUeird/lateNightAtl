import { defineConfig, devices } from '@playwright/test';

const PORT = 4400;

// Browser tests run against a build of tests/fixtures/places.json (fictional, stable data)
// with the clock frozen (see tests/e2e/fixtures.ts), so editing the real data never breaks them.
export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  // Screenshots differ slightly by OS (fonts), so baselines are kept per platform.
  snapshotPathTemplate: '{testDir}/__screenshots__/{platform}/{projectName}/{arg}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01, animations: 'disabled' } },
  use: {
    baseURL: `http://localhost:${PORT}`,
    timezoneId: 'America/New_York',
    locale: 'en-US',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 900 } } },
    { name: 'phone', use: { ...devices['iPhone 13'], browserName: 'chromium' } },
    { name: 'small-phone', use: { ...devices['iPhone SE'], browserName: 'chromium' } },
  ],
  webServer: {
    command: `ASTRO_OUT_DIR=./dist-test PLACES_FILE=tests/fixtures/places.json npx astro build && node tests/serve.mjs dist-test ${PORT}`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
