import { test, expect, visibleNames, openMoreFilters } from './fixtures';

test('defaults to tonight at 9 PM, latest-closing first', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#count')).toHaveText('8 places');
  const names = await visibleNames(page);
  expect(names.slice(0, 2)).toEqual(['Night Owl Diner (sample)', 'Poncey 24 Pharmacy (sample)']);
  expect(names).not.toContain('Castleberry Late Lounge (sample)'); // opens at 10 PM
});

test('"still open at" counts hours that run past midnight', async ({ page }) => {
  await page.goto('/?night=5&at=1560'); // Friday night, 2 AM
  await expect(page.locator('#count')).toHaveText('7 places');
  expect(await visibleNames(page)).toEqual([
    'Night Owl Diner (sample)',
    'Poncey 24 Pharmacy (sample)',
    'Buford Hwy Noodle House (sample)',
    'Castleberry Late Lounge (sample)',
    'Edgewood Hi-Fi (sample)',
    'Little Five Slice (sample)',
    'Taqueria Tardía (sample)',
  ]);
  const statuses = await page.locator('.card:not([hidden]) [data-status]').allTextContents();
  expect(statuses).toEqual(['Open 24 hours', 'Open 24 hours', 'Open till 4 AM', 'Open till 4 AM', 'Open till 3 AM', 'Open till 3 AM', 'Open till 2:30 AM']);
});

test('"Right now" uses the current Atlanta time and disables the time picker', async ({ page }) => {
  await page.goto('/');
  await page.selectOption('select[name=night]', 'now');
  await expect(page.locator('select[name=at]')).toBeDisabled();
  await expect(page.locator('#count')).toHaveText('9 places'); // 10:30 PM: the lounge is open now
});

test('filters sync to the URL and restore from it', async ({ page }) => {
  await page.goto('/');
  await openMoreFilters(page);
  await page.selectOption('select[name=type]', 'bar');
  await expect(page).toHaveURL(/[?&]type=bar/);
  await expect(page.locator('#count')).toHaveText('1 place');
  await page.reload();
  await expect(page.locator('select[name=type]')).toHaveValue('bar');
  await expect(page.locator('#count')).toHaveText('1 place');
  await expect(page.locator('select[name=type]')).toBeVisible(); // extras open for shared links
});

test('search and empty state', async ({ page }) => {
  await page.goto('/');
  await page.fill('input[name=q]', 'pizza');
  await expect(page.locator('#count')).toHaveText('1 place');
  expect(await visibleNames(page)).toEqual(['Little Five Slice (sample)']);
  await page.fill('input[name=q]', 'zzzz');
  await expect(page.locator('#count')).toHaveText('0 places');
  await expect(page.locator('#empty')).toBeVisible();
});

test.describe('near me', () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 33.7645, longitude: -84.3493 } }); // Little Five Points

  test('sorts by distance and filters by radius', async ({ page }) => {
    await page.goto('/');
    await page.click('#near-me');
    await expect(page.locator('#near-me')).toHaveAttribute('aria-pressed', 'true');
    expect((await visibleNames(page))[0]).toBe('Little Five Slice (sample)');
    const miles = (await page.locator('.card:not([hidden]) [data-distance]').allTextContents()).map((s) =>
      s.startsWith('<') ? 0 : parseFloat(s),
    );
    expect(miles).toEqual([...miles].sort((a, b) => a - b));

    await expect(page.locator('#within-chip')).toBeVisible(); // appears once Near me is on
    await page.selectOption('select[name=within]', '1');
    await expect(page.locator('#count')).toHaveText('2 places');
    expect(page.url()).not.toContain('within'); // location stays out of shared links

    await page.click('#near-me'); // toggle off
    await expect(page.locator('select[name=within]')).toBeDisabled();
    await expect(page.locator('#within-chip')).toBeHidden();
    await expect(page.locator('#count')).toHaveText('8 places');
  });
});

test('near me explains a denied permission', async ({ page }) => {
  await page.goto('/');
  await page.click('#near-me');
  await expect(page.locator('#geo-msg')).toContainText('denied');
  await expect(page.locator('#count')).toHaveText('8 places');
});

test('near me explains when the device can’t find a location', async ({ page }) => {
  // Simulate location being off at the OS level (POSITION_UNAVAILABLE).
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'geolocation', {
      value: { getCurrentPosition: (_ok: unknown, fail: (e: { code: number }) => void) => setTimeout(() => fail({ code: 2 }), 50) },
    });
  });
  await page.goto('/');
  await page.click('#near-me');
  await expect(page.locator('#geo-msg')).toContainText('couldn’t find your location');
  await expect(page.locator('#geo-msg')).toContainText('Settings'); // device-specific hint (desktop project reports Windows)
  await expect(page.locator('#near-me')).toHaveText('Near me');
});

test('Filters panel: badge count and Clear', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#extra-filters')).toBeHidden();
  await openMoreFilters(page);
  await page.selectOption('select[name=type]', 'restaurant');
  await page.selectOption('select[name=cuisine]', 'pizza');
  await expect(page.locator('#filter-badge')).toHaveText('2');
  await expect(page.locator('#count')).toHaveText('1 place');
  await page.click('#clear-filters');
  await expect(page.locator('#filter-badge')).toBeHidden();
  await expect(page.locator('#count')).toHaveText('8 places');
  await expect(page).not.toHaveURL(/type=|cuisine=/);
});

test('filters fit in a compact space', async ({ page, isMobile }) => {
  await page.goto('/');
  const h = (await page.locator('#filters').boundingBox())!.height;
  // Desktop: one row. Phones: two rows (search + icons, then night + time).
  expect(h).toBeLessThanOrEqual(isMobile ? 90 : 40);
});

test.describe('phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only behavior');

  test('first result is visible without scrolling', async ({ page }) => {
    await page.goto('/');
    const box = await page.locator('.card:not([hidden])').first().boundingBox();
    expect(box!.y + 60).toBeLessThan(page.viewportSize()!.height);
  });

  test('list/map toggle and the card Map button', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeHidden();
    await page.click('.view-toggle [data-view=map]');
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('#list')).toBeHidden();
    await page.click('.view-toggle [data-view=list]');
    await page.locator('.card:not([hidden]) .locate').first().click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-view', 'map');
    await expect(page.locator('.leaflet-popup')).toBeVisible();
  });

  test('tapping anywhere on a card opens the place', async ({ page }) => {
    await page.goto('/');
    const meta = await page.locator('.card:not([hidden]) .meta').first().boundingBox();
    await page.mouse.click(meta!.x + 10, meta!.y + 5);
    await expect(page).toHaveURL(/\/places\/night-owl-diner\/$/);
  });
});
