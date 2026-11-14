import type { Page } from '@playwright/test';
import { test, expect, waitForMap, showList } from './fixtures';

const PAGES = ['/', '/places/castleberry-late-lounge/', '/places/night-owl-diner/', '/nope/'];

for (const path of PAGES) {
  test(`L01 no sideways scrolling: ${path}`, async ({ page, consoleErrors }) => {
    await page.goto(path);
    if (path === '/nope/') consoleErrors.length = 0; // the 404 status itself is expected
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

/** Controls under 40×40px (a thumb's width) that are on screen now. Inline text links are
    left out: they wrap with their sentence, and the whole line is the target. */
async function smallTargets(page: Page) {
  return page.evaluate(() =>
    [...document.querySelectorAll<HTMLElement>('button, select, input, summary, .btn')]
      .filter((el) => el.checkVisibility() && el.getClientRects().length)
      .map((el) => el.closest<HTMLElement>('.menu-option') ?? el) // a checkbox's target is its whole row
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { el: el.id || el.getAttribute('aria-label') || el.className || el.tagName, w: Math.round(r.width), h: Math.round(r.height) };
      })
      .filter(({ w, h }) => w < 40 || h < 40),
  );
}

test.describe('tap targets are at least 40×40px on phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only');
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 33.7645, longitude: -84.3493 } });

  test('L02 home: the map, its popup, Near me and each menu', async ({ page }) => {
    await page.goto('/');
    await waitForMap(page);
    expect(await smallTargets(page), 'map as it opens').toEqual([]);

    await page.locator('.maplibregl-marker.map-dot-place').first().click();
    await expect(page.locator('.maplibregl-popup')).toBeVisible();
    expect(await smallTargets(page), 'a place popup').toEqual([]);
    await page.locator('.maplibregl-popup-close-button').click();

    await page.click('#near-me');
    await expect(page.locator('#within-chip')).toBeVisible();
    expect(await smallTargets(page), 'Near me on, with Within').toEqual([]);

    for (const name of ['type', 'cuisine']) {
      const menu = page.locator(`.chip-menu[data-filter=${name}]`);
      await menu.locator('summary').click();
      await menu.locator('input').first().setChecked(true); // so its Clear shows too
      expect(await smallTargets(page), `the ${name} menu, open`).toEqual([]);
      await menu.locator('summary').click(); // close it
    }
  });

  test('L03 home: the list', async ({ page }) => {
    await page.goto('/');
    await showList(page);
    expect(await smallTargets(page)).toEqual([]);
  });

  test('L04 a place page, with your location and route', async ({ page }) => {
    await page.goto('/places/castleberry-late-lounge/');
    await waitForMap(page);
    await expect(page.locator('#route')).toBeVisible(); // location allowed: shown without asking
    expect(await smallTargets(page), 'with Drive/Walk').toEqual([]);
  });
});

test('L05 the search hint fits its box', async ({ page }) => {
  await page.goto('/');
  const fits = await page.locator('input[name=q]').evaluate((input: HTMLInputElement) => {
    // Measure the placeholder in the input's own font against the room inside it.
    const cs = getComputedStyle(input);
    const ctx = document.createElement('canvas').getContext('2d')!;
    ctx.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
    // From the outer box: Chromium's clientWidth for a search input already leaves out the padding.
    const room = input.getBoundingClientRect().width - parseFloat(cs.borderLeftWidth) - parseFloat(cs.borderRightWidth) - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
    return ctx.measureText(input.placeholder).width <= room;
  });
  expect(fits).toBe(true);
});

test.describe('screenshots', () => {
  test('L06 home', async ({ page }) => {
    await page.goto('/');
    await waitForMap(page);
    await expect(page).toHaveScreenshot('home.png');
  });

  test('L07 home with filters open', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'filters are always open on desktop');
    await page.goto('/?cuisine=pizza');
    await expect(page).toHaveScreenshot('home-filters.png');
  });

  test('L08 list view', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'desktop shows the list in the home screenshot');
    await page.goto('/');
    await showList(page);
    await expect(page).toHaveScreenshot('list.png');
  });

  test('L09 place page', async ({ page }) => {
    await page.goto('/places/castleberry-late-lounge/');
    await waitForMap(page);
    await expect(page).toHaveScreenshot('place.png', { fullPage: true });
  });
});
