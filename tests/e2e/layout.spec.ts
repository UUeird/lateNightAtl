import { test, expect, waitForMap, openMoreFilters } from './fixtures';

const PAGES = ['/', '/places/castleberry-late-lounge/', '/places/night-owl-diner/', '/nope/'];

for (const path of PAGES) {
  test(`no sideways scrolling: ${path}`, async ({ page, consoleErrors }) => {
    await page.goto(path);
    if (path === '/nope/') consoleErrors.length = 0; // the 404 status itself is expected
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test('tap targets are at least 40px tall on phones', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'phone-only');
  for (const path of ['/', '/places/castleberry-late-lounge/']) {
    await page.goto(path);
    if (path === '/') {
      await openMoreFilters(page); // reveal the extra filters too
      await page.locator('.chip-menu[data-filter=area] summary').click(); // and a menu's options
    }
    const small = await page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('button, select, input, .btn, .leaflet-bar a')]
        .filter((el) => el.offsetParent !== null && el.checkVisibility())
        .map((el) => el.closest<HTMLElement>('.menu-option') ?? el) // a checkbox's tap target is its whole row
        .map((el) => ({ el: el.id || el.className || el.tagName, h: el.getBoundingClientRect().height }))
        .filter(({ h }) => h < 40),
    );
    expect(small, `small tap targets on ${path}`).toEqual([]);
  }
});

test.describe('screenshots', () => {
  test('home', async ({ page }) => {
    await page.goto('/');
    await waitForMap(page);
    await expect(page).toHaveScreenshot('home.png');
  });

  test('home with filters open', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'filters are always open on desktop');
    await page.goto('/?area=Midtown');
    await expect(page).toHaveScreenshot('home-filters.png');
  });

  test('map view', async ({ page, isMobile }) => {
    test.skip(!isMobile, 'desktop shows the map in the home screenshot');
    await page.goto('/');
    await page.click('.view-toggle [data-view=map]');
    await waitForMap(page);
    await expect(page).toHaveScreenshot('map.png');
  });

  test('place page', async ({ page }) => {
    await page.goto('/places/castleberry-late-lounge/');
    await waitForMap(page);
    await expect(page).toHaveScreenshot('place.png', { fullPage: true });
  });
});
