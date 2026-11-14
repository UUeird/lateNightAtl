import { test, expect, visibleNames, pick, showList, searchFor, ANY } from './fixtures';

test('E01 starts at tonight, 9 PM, latest-closing first', { tag: ANY }, async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('#count')).toHaveText('8 places');
  const names = await visibleNames(page);
  expect(names.slice(0, 2)).toEqual(['Night Owl Diner (sample)', 'Poncey 24 Pharmacy (sample)']);
  expect(names).not.toContain('Castleberry Late Lounge (sample)'); // opens at 10 PM
});

test.describe('a new visitor', { tag: ANY }, () => {
  test.use({ freshVisitor: true });

  test('E02 sees everything but errands (no pharmacy or grocery)', async ({ page }) => {
    await page.goto('/');
    await showList(page);
    const names = await visibleNames(page);
    expect(names).not.toContain('Poncey 24 Pharmacy (sample)'); // the fixtures' CVS
    expect(names).toContain('Edgewood Hi-Fi (sample)'); // bars, clubs and food are in
    expect(names).toContain('Night Owl Diner (sample)');
    const ticked = await page.locator('.chip-menu[data-filter=type] input:checked').evaluateAll((els) => els.map((e) => (e as HTMLInputElement).value));
    expect(ticked).not.toContain('pharmacy');
    expect(ticked).not.toContain('grocery');
    await expect(page.locator('.chip-menu[data-filter=type]')).toHaveClass(/is-active/);
    expect(page.url()).not.toContain('type='); // the default stays out of the URL
    // The map shows the same results as the list.
    await expect(page.locator('#map')).toHaveAttribute('data-labels', /\|/); // the map loads after the list
    const labels = (await page.locator('#map').getAttribute('data-labels'))!.split('|');
    expect(labels).toEqual(names);
  });

  test('E03 keeps their Type filter between visits, and a shared link wins', async ({ page }) => {
    await page.goto('/');
    await pick(page, 'type', 'pharmacy');
    await page.goto('/'); // a later visit, same browser
    await showList(page);
    expect(await visibleNames(page)).toContain('Poncey 24 Pharmacy (sample)');
    await page.locator('.chip-menu[data-filter=type] summary').click();
    await page.locator('.chip-menu[data-filter=type] .menu-clear').click(); // all types
    await page.goto('/');
    await expect(page.locator('.chip-menu[data-filter=type] input:checked')).toHaveCount(0);
    expect(page.url()).toContain('type=all');
    await page.goto('/?type=bar'); // a shared link shows what was shared…
    await expect(page.locator('#count')).toHaveText('1 place');
    await page.goto('/'); // …without changing what's remembered
    await expect(page.locator('.chip-menu[data-filter=type] input:checked')).toHaveCount(0);
  });

  test('E04 keeps their cuisine too, but not the night or time', async ({ page }) => {
    await page.goto('/');
    await pick(page, 'cuisine', 'pizza');
    await page.selectOption('select[name=night]', '6'); // Sat night
    await page.selectOption('select[name=at]', '1440'); // 12 AM
    await page.goto('/');
    await expect(page.locator('.chip-menu[data-filter=cuisine] input:checked')).toHaveCount(1);
    await expect(page.locator('.chip-menu[data-filter=cuisine] input[value=pizza]')).toBeChecked();
    await expect(page.locator('select[name=night]')).toHaveValue('tonight');
    await expect(page.locator('select[name=at]')).toHaveValue('1260');
    // The type default still applies alongside them.
    await expect(page.locator('.chip-menu[data-filter=type] input[value=pharmacy]')).not.toBeChecked();
    // A shared link shows exactly what was shared, not these.
    await page.goto('/?type=bar');
    await expect(page.locator('select[name=night]')).toHaveValue('tonight');
    await expect(page.locator('.chip-menu[data-filter=cuisine] input:checked')).toHaveCount(0);
  });
});

test('E05 "still open at" counts hours that run past midnight', { tag: ANY }, async ({ page }) => {
  await page.goto('/?night=5&at=1560&type=all'); // Friday night, 2 AM, every type
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

test('E06 "Right now" uses the current Atlanta time and disables the time picker', { tag: ANY }, async ({ page }) => {
  await page.goto('/');
  await page.selectOption('select[name=night]', 'now');
  await expect(page.locator('select[name=at]')).toBeDisabled();
  await expect(page.locator('#count')).toHaveText('9 places'); // 10:30 PM: the lounge is open now
});

test('E07 filters sync to the URL and restore from it', { tag: ANY }, async ({ page }) => {
  await page.goto('/');
  await pick(page, 'type', 'bar');
  await expect(page).toHaveURL(/[?&]type=bar/);
  await expect(page.locator('#count')).toHaveText('1 place');
  await page.reload();
  await expect(page.locator('input[name=type][value=bar]')).toBeChecked();
  await expect(page.locator('#count')).toHaveText('1 place');
  await expect(page.locator('.chip-menu[data-filter=type]')).toHaveClass(/is-active/); // marked as in use
  await expect(page.locator('.chip-menu[data-filter=type] summary')).toHaveText('Type: Bar');
});

test('E08 filters are multi-select: any of the picked values, in each filter', { tag: ANY }, async ({ page }) => {
  await page.goto('/');
  await pick(page, 'type', 'bar');
  await expect(page.locator('#count')).toHaveText('1 place');
  await pick(page, 'type', 'food');
  await expect(page.locator('.chip-menu[data-filter=type] summary')).toHaveText('Type: 2 types');
  await expect(page).toHaveURL(/type=bar&type=food|type=food&type=bar/);
  const both = await page.locator('#count').textContent();
  expect(parseInt(both!)).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.chip-menu[data-filter=type]')).not.toHaveAttribute('open');
  await page.reload(); // restores both from the URL
  await expect(page.locator('#count')).toHaveText(both!);
  await expect(page.locator('input[name=type]:checked')).toHaveCount(2);
});

test('E09 a place can have several types', { tag: ANY }, async ({ page }) => {
  for (const t of ['grocery', 'pharmacy']) {
    await page.goto(`/?type=${t}`);
    expect(await visibleNames(page)).toEqual(['Poncey 24 Pharmacy (sample)']);
  }
  await expect(page.locator('.card:not([hidden]) .meta')).toContainText('Grocery & Pharmacy');
});

test('E10 old Restaurant/Diner links map to Food', { tag: ANY }, async ({ page }) => {
  await page.goto('/?type=diner');
  await expect(page.locator('input[name=type][value=food]')).toBeChecked();
  await expect(page).toHaveURL(/[?&]type=food/);
});

test('E11 tags show on cards and are searchable', { tag: ANY }, async ({ page }) => {
  await page.goto('/?night=5&at=1440'); // Friday, midnight: the lounge is open
  const card = page.locator('.card:not([hidden])', { hasText: 'Castleberry Late Lounge' });
  await expect(card.locator('.tag')).toHaveText(['Cover', '21+']); // short labels on cards
  await searchFor(page, 'cover');
  await expect(page.locator('#count')).toHaveText('1 place');
  expect(await visibleNames(page)).toEqual(['Castleberry Late Lounge (sample)']);
});

test('E12 search and empty state', { tag: ANY }, async ({ page }) => {
  await page.goto('/');
  await searchFor(page, 'pizza');
  await expect(page.locator('#count')).toHaveText('1 place');
  expect(await visibleNames(page)).toEqual(['Little Five Slice (sample)']);
  await searchFor(page, 'zzzz');
  await expect(page.locator('#count')).toHaveText('0 places');
  await showList(page);
  await expect(page.locator('#empty')).toBeVisible();
});

test.describe('near me', { tag: ANY }, () => {
  test.use({ permissions: ['geolocation'], geolocation: { latitude: 33.7645, longitude: -84.3493 } }); // Little Five Points

  test('E13 sorts by distance and filters by radius', async ({ page }) => {
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

test('E14 near me explains a denied permission', async ({ page, isMobile }) => {
  await page.goto('/');
  await page.click('#near-me');
  await expect(page.locator('#geo-msg')).toContainText('Location is blocked for this site');
  // iPhones (the phone projects) get Safari's own setting, since Safari never prompts when it's Deny.
  await expect(page.locator('#geo-msg')).toContainText(isMobile ? 'Settings → Apps → Safari → Location' : 'site settings');
  // …and the system-wide Safari Websites switch, which refuses every site without asking.
  if (isMobile) await expect(page.locator('#geo-msg')).toContainText('Location Services → Safari Websites');
  await expect(page.locator('#count')).toHaveText('8 places');
});

test('E15 near me explains when the device can’t find a location', { tag: ANY }, async ({ page }) => {
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
  await expect(page.locator('#near-me')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#near-me')).toBeEnabled();
});

test('E16 map dots are fixed-size HTML markers, one per result', { tag: ANY }, async ({ page }) => {
  // SVG circle markers scale during a pinch zoom, then snap back; HTML markers don't.
  await page.goto('/');
  const dots = page.locator('.maplibregl-marker.map-dot-place');
  await expect(dots).toHaveCount(8);
  const before = (await dots.first().boundingBox())!;
  await page.click('.maplibregl-ctrl-zoom-in');
  // Once the zoom has moved the dot, it should still be the same size.
  await expect.poll(async () => (await dots.first().boundingBox())!.x, { timeout: 5000 }).not.toBe(before.x);
  await expect.poll(async () => (await dots.first().boundingBox())!.width).toBe(before.width);
});

test('E17 map labels follow the results, best first', { tag: ANY }, async ({ page }) => {
  // The names are drawn into the map canvas (with collision handling), so check what it's given.
  await page.goto('/?type=bar');
  await expect(page.locator('#map')).toHaveAttribute('data-labels', 'Edgewood Hi-Fi (sample)');
  await page.goto('/');
  await expect(page.locator('#map')).toHaveAttribute('data-labels', /\|/); // the map loads after the list
  const names = (await page.locator('#map').getAttribute('data-labels'))!.split('|');
  expect(names).toEqual(await visibleNames(page));
});

test('E18 map popup has Directions and Details buttons', async ({ page, isMobile }) => {
  await page.goto('/');
  await showList(page);
  await page.locator('.card:not([hidden]) .locate').first().click(); // Night Owl Diner
  const popup = page.locator('.maplibregl-popup');
  await expect(popup).toBeVisible();
  await expect(popup.locator('.popup-status')).toHaveText('Open 24 hours');
  const directions = popup.getByRole('link', { name: 'Directions' });
  await expect(directions).toHaveAttribute(
    'href',
    isMobile // iPhones get Apple Maps
      ? 'https://maps.apple.com/?daddr=100%20Example%20St%20NE%2C%20Atlanta%2C%20GA%2030308'
      : 'https://www.google.com/maps/dir/?api=1&destination=100%20Example%20St%20NE%2C%20Atlanta%2C%20GA%2030308',
  );
  await expect(popup.getByRole('link', { name: 'Details' })).toHaveAttribute('href', '/places/night-owl-diner/');
  // Its tap-target sizes are checked with the rest in layout.spec.ts.
});

test('E19 clearing filters: each menu\'s own Clear, and Clear for all (desktop)', async ({ page, isMobile }) => {
  await page.goto('/');
  await pick(page, 'type', 'food');
  await expect(page.locator('#count')).toHaveText('5 places');
  // A menu's Clear clears just that menu.
  await page.locator('.chip-menu[data-filter=type] .menu-clear').click();
  await expect(page.locator('#count')).toHaveText('8 places');
  await expect(page.locator('.chip-menu[data-filter=type] .menu-clear')).toBeHidden(); // nothing left to clear
  await pick(page, 'type', 'food');
  await pick(page, 'cuisine', 'pizza');
  await expect(page.locator('#count')).toHaveText('1 place');
  if (isMobile) {
    await expect(page.locator('#clear-filters')).toBeHidden(); // phones clear menu by menu
    return;
  }
  await page.mouse.click(5, 5); // close the menu
  await page.click('#clear-filters');
  await expect(page.locator('#clear-filters')).toBeHidden();
  await expect(page.locator('#count')).toHaveText('8 places');
  await expect(page).not.toHaveURL(/cuisine=/);
  await expect(page).toHaveURL(/type=all/); // all types isn't the default, so it's spelled out
  await expect(page.locator('input[type=checkbox]:checked')).toHaveCount(0);
});

test('E20 filters fit in one row', async ({ page }) => {
  await page.goto('/');
  // Desktop: one row of chips. Phones: one row of icons.
  expect((await page.locator('#filters').boundingBox())!.height).toBeLessThanOrEqual(42);
});

test.describe('desktop fits the window', () => {
  test.skip(({ isMobile }) => isMobile, 'phones scroll the page');

  for (const height of [500, 1200]) {
    test(`E21 page doesn't scroll; the list does, and the map fills the height (${height}px window)`, async ({ page }) => {
      await page.setViewportSize({ width: 1280, height });
      await page.goto('/');
      const doc = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
      expect(doc).toBeLessThanOrEqual(0);
      const map = (await page.locator('#map').boundingBox())!;
      expect(map.y + map.height).toBeLessThanOrEqual(height); // map ends on screen…
      expect(height - (map.y + map.height)).toBeLessThan(20); // …near the bottom of the window
      expect(map.height).toBeGreaterThan(height - 300);

      if (height === 500) {
        // Short window: the list overflows and scrolls on its own, the filters stay put.
        const list = page.locator('#list');
        expect(await list.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
        await list.hover();
        await page.mouse.wheel(0, 400);
        await expect.poll(() => list.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
        expect(await page.evaluate(() => window.scrollY)).toBe(0);

        // Custom scrollbar: native bar hidden, fading thumb shown while scrolling; edge fades.
        expect(await list.evaluate((el: HTMLElement) => el.offsetWidth - el.clientWidth)).toBe(0); // no native bar gutter
        await expect(page.locator('#list-panel .scrollthumb')).toHaveClass(/is-visible/);
        await expect(page.locator('#list-panel')).toHaveClass(/scrolled-top/);
        await expect(page.locator('.scrollthumb')).not.toHaveClass(/is-visible/, { timeout: 3000 }); // fades after
        await list.evaluate((el) => el.scrollTo({ top: el.scrollHeight }));
        await expect(page.locator('#list-panel')).not.toHaveClass(/scrollable-bottom/);
      }
    });
  }
});

test.describe('phones', () => {
  test.skip(({ isMobile }) => !isMobile, 'phone-only behavior');

  test('E22 search floats over the bottom of the map, and stays put in the list', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[name=q]');
    await expect(input).toBeVisible();
    const box = (await input.boundingBox())!;
    const map = (await page.locator('#map').boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(box.y + box.height).toBeGreaterThan(vh - 48); // at the bottom of the screen
    expect(box.y).toBeGreaterThan(map.y);
    expect(box.y).toBeLessThan(map.y + map.height); // over the map
    expect(map.y + map.height).toBeLessThanOrEqual(vh - 12); // the map's frame ends on screen
    expect(box.x).toBeGreaterThanOrEqual(map.x + 8); // the search sits inside the frame, clear of its edges
    expect(box.x + box.width).toBeLessThanOrEqual(map.x + map.width - 8);
    expect(box.y + box.height).toBeLessThanOrEqual(map.y + map.height - 8);
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= innerHeight)).toBe(true); // no page scroll
    await input.fill('pizza');
    await expect(page.locator('#count')).toHaveText('1 place');
    await showList(page);
    await expect(input).toBeVisible();
    expect((await input.boundingBox())!.y).toBeCloseTo(box.y, 0);
  });

  test('E23 opens on the map', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('#list')).toBeHidden();
    await expect(page.locator('.view-toggle [data-view=map]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.maplibregl-marker.map-dot-place')).toHaveCount(8);
  });

  test('E24 filters slide away on scroll down and return on scroll up', async ({ page }) => {
    await page.goto('/');
    await showList(page);
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

  test('E25 first result is visible without scrolling, once on the list', async ({ page }) => {
    await page.goto('/');
    await showList(page);
    const box = await page.locator('.card:not([hidden])').first().boundingBox();
    expect(box!.y + 60).toBeLessThan(page.viewportSize()!.height);
  });

  test('E26 list/map toggle and the card Map button', async ({ page }) => {
    await page.goto('/');
    await page.click('.view-toggle [data-view=list]');
    await expect(page.locator('#list')).toBeVisible();
    await expect(page.locator('#map')).toBeHidden();
    await page.locator('.card:not([hidden]) .locate').first().click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-view', 'map');
    await expect(page.locator('.maplibregl-popup')).toBeVisible();
  });

  test('E27 tapping anywhere on a card opens the place', async ({ page }) => {
    await page.goto('/');
    await showList(page);
    const meta = await page.locator('.card:not([hidden]) .meta').first().boundingBox();
    await page.mouse.click(meta!.x + 10, meta!.y + 5);
    await expect(page).toHaveURL(/\/places\/night-owl-diner\/$/);
  });
});
