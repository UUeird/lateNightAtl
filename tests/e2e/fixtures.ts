import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Friday, Nov 13 2026, 10:30 PM in Atlanta. "Tonight" is Friday night. */
export const NOW = new Date('2026-11-14T03:30:00Z');

export const places: { id: string; name: string }[] = JSON.parse(readFileSync('tests/fixtures/places.json', 'utf8'));

// 1x1 transparent PNG, served instead of real map tiles so screenshots are stable and offline.
const BLANK_TILE = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

export const test = base.extend<{ consoleErrors: string[] }>({
  // Applied to every test: frozen clock, no network tiles, and fail on any console error.
  consoleErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.clock.setFixedTime(NOW);
      await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ contentType: 'image/png', body: BLANK_TILE }));
      await use(errors);
      expect(errors, 'browser console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

export const visibleNames = (page: Page) => page.locator('.card:not([hidden]) h2').allTextContents();

/** Area/Type/Cuisine sit behind the "Filters" button. */
export async function openMoreFilters(page: Page) {
  const btn = page.locator('#more-filters');
  if ((await btn.getAttribute('aria-expanded')) !== 'true') await btn.click();
}

/** Tick one option in an Area/Type/Cuisine menu (opening the panel and menu as needed). */
export async function pick(page: Page, name: string, value: string) {
  await openMoreFilters(page);
  const menu = page.locator(`.chip-menu[data-filter="${name}"]`);
  if (!(await menu.evaluate((d: HTMLDetailsElement) => d.open))) await menu.locator('summary').click();
  await menu.locator(`input[value="${value}"]`).check();
}

export async function waitForMap(page: Page) {
  await page.locator('.leaflet-interactive').first().waitFor({ state: 'attached' });
}
