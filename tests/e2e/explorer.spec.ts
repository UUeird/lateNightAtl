import { test, expect, visibleNames, pick } from './fixtures';

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
  await pick(page, 'type', 'bar');
  await expect(page).toHaveURL(/[?&]type=bar/);
  await expect(page.locator('#count')).toHaveText('1 place');
  await page.reload();
  await expect(page.locator('input[name=type][value=bar]')).toBeChecked();
  await expect(page.locator('#count')).toHaveText('1 place');
  await expect(page.locator('.chip-menu[data-filter=type] summary')).toBeVisible(); // extras open for shared links
  await expect(page.locator('.chip-menu[data-filter=type] summary')).toHaveText('Type: Bar');
});

test('filters are multi-select: any of the picked values, in each filter', async ({ page }) => {
  await page.goto('/');
  await pick(page, 'type', 'bar');
  await expect(page.locator('#count')).toHaveText('1 place');
  await pick(page, 'type', 'food');
  await expect(page.locator('.chip-menu[data-filter=type] summary')).toHaveText('Type: 2 types');
  await expect(page).toHaveURL(/type=bar&type=food|type=food&type=bar/);
  const both = await page.locator('#count').textContent();
  expect(parseInt(both!)).toBeGreaterThan(1);
  await expect(page.locator('#filter-badge')).toHaveText('2');
  await page.keyboard.press('Escape');
  await expect(page.locator('.chip-menu[data-filter=type]')).not.toHaveAttribute('open');
  await page.reload(); // restores both from the URL
  await expect(page.locator('#count')).toHaveText(both!);
  await expect(page.locator('input[name=type]:checked')).toHaveCount(2);
});

test('a place can have several types', async ({ page }) => {
  for (const t of ['grocery', 'pharmacy']) {
    await page.goto(`/?type=${t}`);
    expect(await visibleNames(page)).toEqual(['Poncey 24 Pharmacy (sample)']);
  }
  await expect(page.locator('.card:not([hidden]) .meta')).toContainText('Grocery & Pharmacy');
});

test('old Restaurant/Diner links map to Food', async ({ page }) => {
  await page.goto('/?type=diner');
  await expect(page.locator('input[name=type][value=food]')).toBeChecked();
  await expect(page).toHaveURL(/[?&]type=food/);
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

test('map popup has Directions and Details buttons', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.locator('.card:not([hidden]) .locate').first().click(); // Night Owl Diner
  const popup = page.locator('.leaflet-popup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('.popup-status')).toHaveText('Open 24 hours');
  const directions = popup.getByRole('link', { name: 'Directions' });
  await expect(directions).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=100%20Example%20St%20NE%2C%20Atlanta%2C%20GA%2030308');
  await expect(popup.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/places/night-owl-diner/');
  if (isMobile) expect((await directions.boundingBox())!.height).toBeGreaterThanOrEqual(40);
});

test('Filters panel: badge count and Clear', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#extra-filters')).toBeHidden();
  await pick(page, 'type', 'food');
  await pick(page, 'cuisine', 'pizza');
  await expect(page.locator('#filter-badge')).toHaveText('2');
  await expect(page.locator('#count')).toHaveText('1 place');
  await page.click('#clear-filters');
  await expect(page.locator('#filter-badge')).toBeHidden();
  await expect(page.locator('#count')).toHaveText('8 places');
  await expect(page).not.toHaveURL(/type=|cuisine=/);
  await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(0);
});

test('filters fit in a compact space', async ({ page, isMobile }) => {
  await page.goto('/');
  const h = (await page.locator('#filters').boundingBox())!.height;
  // Desktop: one row. Phones: two rows (search + icons, then night + time).
  expect(h).toBeLessThanOrEqual(isMobile ? 90 : 40);
});

test.describe('desktop fits the window', () => {
  test.skip(({ isMobile }) => isMobile, 'phones scroll the page');

  for (const height of [500, 1200]) {
    test(`page doesn't scroll; the list does, and the map fills the height (${height}px window)`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height });
      await page.goto('/');
      const doc = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(doc).toBeLessThanOrEqual(0);
      const map = (await page.locator('#map').boundingBox())!;
      const footer = (await page.locator('.site-footer').boundingBox())!;
      expect(footer.y + footer.height).toBeLessThanOrEqual(height + 1); // footer still on screen
      expect(footer.y - (map.y + map.height)).toBeLessThan(20); // map reaches down to it
      expect(map.height).toBeGreaterThan(height - 300);

      if (height === 500) {
        // Short window: the list overflows and scrolls on its own, the filters stay put.
        const list = page.locator('#list');
        expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        await list.hover();
        await page.mouse.wheel(0, 400);
        await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);
      }
    });
  }
});

test.describe('phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only behavior');

  test('filters slide away on scroll down and return on scroll up', async ({ page }) => {
    await page.goto('/');
    const filters = page.locator('#filters');
    const bar = page.locator('.results-bar');
    await page.mouse.wheel(0, 500);
    await expect(page.locator('#toolbar')).toHaveClass(/is-collapsed/);
    await expect.poll(async () => (await filters.boundingBox())!.y + (await filters.boundingBox())!.height).toBeLessThanOrEqual(0);
    await expect.poll(async () => (await bar.boundingBox())!.y).toBeLessThan(20); // count + List/Map still pinned
    await page.mouse.wheel(0, -100);
    await expect(page.locator('#toolbar')).not.toHaveClass(/is-collapsed/);
    await expect.poll(async () => (await filters.boundingBox())!.y).toBeGreaterThanOrEqual(0);
  });

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
