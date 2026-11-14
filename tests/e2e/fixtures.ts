import { test as base, expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

/** Friday, Nov 13 2026, 10:30 PM in Atlanta. "Tonight" is Friday night. */
export const NOW = new Date('2026-11-14T03:30:00Z');

export const places: { id: string; name: string }[] = JSON.parse(readFileSync('tests/fixtures/places.json', 'utf8'));

// A one-layer map style, served instead of OpenFreeMap's so tests are stable and offline.
const BLANK_STYLE = JSON.stringify({
  version: 8,
  sources: {},
  glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',
  layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#1b1d2e' } }],
});

// A fixed route (2 minutes, 0.9 miles), served instead of the routing server's.
const ROUTE = JSON.stringify({
  trip: { summary: { time: 101.9, length: 0.8923 }, legs: [{ shape: 'ghyk_Alpg{_DyGAgF@iFAeD?mBEuACcCEgMS' }] },
});

export const test = base.extend<{ consoleErrors: string[]; freshVisitor: boolean }>({
  // Tests start as a returning visitor who chose all types, so the default Type filter
  // (no grocery or pharmacy) doesn't shape every count. `test.use({ freshVisitor: true })`
  // starts with nothing saved instead.
  freshVisitor: [false, { option: true }],
  // Applied to every test: frozen clock, no network map, and fail on any console error.
  consoleErrors: [
    async ({ page, freshVisitor }, use) => {
      if (!freshVisitor) {
        await page.addInitScript(() => {
          if (localStorage.getItem('lateNightAtl:filters') === null) localStorage.setItem('lateNightAtl:filters', '{"type":[]}');
        });
      }
      const errors: string[] = [];
      page.on('pageerror', (e) => errors.push(e.message));
      page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
      await page.clock.setFixedTime(NOW);
      await page.route(/tiles\.openfreemap\.org/, (r) =>
        r.request().url().includes('/fonts/')
          ? r.fulfill({ contentType: 'application/x-protobuf', body: Buffer.alloc(0) }) // no glyphs: labels draw nothing
          : r.fulfill({ contentType: 'application/json', body: BLANK_STYLE }),
      );
      await page.route(/valhalla1\.openstreetmap\.de/, (r) => r.fulfill({ contentType: 'application/json', body: ROUTE }));
      await use(errors);
      expect(errors, 'browser console errors').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Tag for tests whose outcome doesn't depend on the screen (logic, data, URLs). They run
    on the desktop project only; see grepInvert in playwright.config.ts. */
export const ANY = '@any-screen';

export const visibleNames = (page: Page) => page.locator('.card:not([hidden]) h2').allTextContents();

/** Type a search. */
export async function searchFor(page: Page, text: string) {
  await page.locator('input[name=q]').fill(text);
}

/** Tick one option in a Type/Cuisine menu (opening the menu as needed). */
export async function pick(page: Page, name: string, value: string) {
  const menu = page.locator(`.chip-menu[data-filter="${name}"]`);
  if (!(await menu.evaluate((d: HTMLDetailsElement) => d.open))) await menu.locator('summary').click();
  await menu.locator(`input[value="${value}"]`).check();
}

/** Phones open on the map; switch to the list (no-op on desktop, which shows both). */
export async function showList(page: Page) {
  const listBtn = page.locator('.view-toggle [data-view=list]');
  if (await listBtn.isVisible()) await listBtn.click();
}

export async function waitForMap(page: Page) {
  await page.locator('.maplibregl-marker').first().waitFor({ state: 'attached' });
  await page.locator('.maplibregl-canvas').waitFor({ state: 'attached' });
}
