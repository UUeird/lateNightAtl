import { test, expect, visibleNames, pick, showList, searchFor, swipe, setWhen, whenValue, waitForMap, ANY } from './fixtures';

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
    await pick(page, 'type', 'food'); // opens the menu; Food starts on, with every cuisine
    await page.locator('input[name=type][value=food]').click(); // from its minus (no fast food): all…
    await page.locator('input[name=type][value=food]').click(); // …then all off…
    await pick(page, 'cuisine', 'pizza'); // …then just Pizza
    await setWhen(page, { night: '6', at: '1440' }); // Sat night, 12 AM
    await page.goto('/');
    await expect(page.locator('input[name=cuisine]:checked')).toHaveCount(1);
    await expect(page.locator('input[name=cuisine][value=pizza]')).toBeChecked();
    await expect(whenValue(page, 'night')).toHaveValue('tonight');
    await expect(whenValue(page, 'at')).toHaveValue('1260');
    // The type default still applies alongside them.
    await expect(page.locator('.chip-menu[data-filter=type] input[value=pharmacy]')).not.toBeChecked();
    // A shared link shows exactly what was shared, not these.
    await page.goto('/?type=bar');
    await expect(whenValue(page, 'night')).toHaveValue('tonight');
    await expect(page.locator('input[name=cuisine]:checked')).toHaveCount(0);
  });
});

test('E05 "open until" counts hours that run past midnight', { tag: ANY }, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T07:00:00Z')); // 2 AM, so every result is open now
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

test('E06 from 9 PM it opens on "Right now", using the current time with the time picker off', { tag: ANY }, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T03:30:00Z')); // 10:30 PM
  await page.goto('/');
  await expect(whenValue(page, 'night')).toHaveValue('now');
  await expect(page.locator('#when-times input').first()).toBeDisabled();
  await expect(page.locator('#when-menu summary')).toHaveAccessibleName('When: Right now');
  await expect(page.locator('#when-menu')).not.toHaveClass(/is-active/); // the default, not a choice
  await expect(page.locator('#count')).toHaveText('9 places'); // 10:30 PM: the lounge is open now
  expect(page.url()).not.toContain('night=');
});

test('E06a before 9 PM it opens on "Tonight"; picking "Right now" closes the menu', { tag: ANY }, async ({ page }) => {
  await page.goto('/'); // 8:30 PM
  await expect(whenValue(page, 'night')).toHaveValue('tonight');
  await setWhen(page, { night: 'now' });
  await expect(page.locator('#when-menu')).not.toHaveAttribute('open'); // "Right now" needs no time
  await expect(page.locator('#when-menu')).toHaveClass(/is-active/);
  await expect(page).toHaveURL(/night=now/);
});

test('E06b "Open until" starts half an hour out, and that default stays out of the URL', { tag: ANY }, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T04:40:00Z')); // 11:40 PM
  await page.goto('/');
  await expect(whenValue(page, 'at')).toHaveValue('1470'); // 12:30 AM, for when Tonight is picked
  await setWhen(page, { night: 'tonight' });
  await expect(page.locator('#when-menu summary')).toHaveAccessibleName('When: Tonight · till 12:30 AM');
  expect(page.url()).not.toContain('at=');
  await page.goto('/?night=5'); // a shared link without a time gets it too
  await expect(whenValue(page, 'at')).toHaveValue('1470');
});

test('E06c tonight, places that open later still show, dimmed and marked, after the open ones', { tag: ANY }, async ({ page }) => {
  await page.goto('/?at=1440&type=all'); // 8:30 PM, open until midnight
  await showList(page);
  const names = await visibleNames(page);
  expect(names.at(-1)).toBe('Castleberry Late Lounge (sample)'); // opens at 10 PM
  const lounge = page.locator('.card[data-id=castleberry-late-lounge]');
  await expect(lounge).toHaveClass(/not-yet/);
  await expect(lounge.locator('[data-status]')).toHaveText('Not open yet · 10 PM – 4 AM');
  await expect(page.locator('.card.not-yet')).toHaveCount(1);
  // Another night has no "now": nothing is marked.
  await setWhen(page, { night: '6' });
  await expect(page.locator('.card.not-yet')).toHaveCount(0);
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
  await expect(page.locator('.chip-menu[data-filter=type] summary')).toHaveAccessibleName('Type: Bar');
});

test('E08 filters are multi-select: any of the picked values, in each filter', { tag: ANY }, async ({ page }) => {
  await page.goto('/');
  await pick(page, 'type', 'bar');
  await expect(page.locator('#count')).toHaveText('1 place');
  await pick(page, 'type', 'food');
  await expect(page.locator('.chip-menu[data-filter=type] summary')).toHaveAccessibleName('Type: 2 picked');
  await expect(page).toHaveURL(/type=bar&type=food|type=food&type=bar/);
  const both = await page.locator('#count').textContent();
  expect(parseInt(both!)).toBeGreaterThan(1);
  await page.keyboard.press('Escape');
  await expect(page.locator('.chip-menu[data-filter=type]')).not.toHaveAttribute('open');
  await page.reload(); // restores both from the URL
  await expect(page.locator('#count')).toHaveText(both!);
  // (Read in the page: Playwright's :checked doesn't count Food at its minus.)
  expect(await page.locator('input[name=type]').evaluateAll((els) => els.filter((e) => (e as HTMLInputElement).checked).length)).toBe(2);
});

test('E08b Food is the parent of its cuisines: all of them, some (a minus), or none', { tag: ANY }, async ({ page }) => {
  await page.goto('/?type=bar');
  const food = page.locator('input[name=type][value=food]');
  const cuisines = page.locator('input[name=cuisine]');
  const summary = page.locator('.chip-menu[data-filter=type] summary');
  const partial = () => food.evaluate((b: HTMLInputElement) => b.indeterminate);

  await pick(page, 'type', 'food'); // Food ticks the usual cuisines: all but fast food
  await expect(cuisines.and(page.locator(':not(:checked)'))).toHaveCount(1);
  await expect(page.locator('input[name=cuisine][value="fast food"]')).not.toBeChecked();
  expect(await partial()).toBe(true);
  await expect(summary).toHaveAccessibleName('Type: 2 picked'); // Bar, Food
  await expect(page).not.toHaveURL(/cuisine=/); // the usual food is just type=food

  await page.goto('/?type=food&cuisine=pizza'); // some cuisines: a minus
  await expect(food).toBeChecked();
  expect(await partial()).toBe(true);
  await expect(summary).toHaveAccessibleName('Type: Pizza');
  expect(await visibleNames(page)).toEqual(['Little Five Slice (sample)']);

  await summary.click(); // open the menu
  await food.click(); // from the minus: all food
  await expect(cuisines.and(page.locator(':checked'))).toHaveCount(await cuisines.count());
  expect(await partial()).toBe(false);
  await expect(summary).toHaveAccessibleName('Type: Food');

  await page.locator('input[name=cuisine][value=pizza]').uncheck(); // one off: a minus again
  expect(await partial()).toBe(true);
  await food.click(); // all on…
  await food.click(); // …then all off
  await expect(food).not.toBeChecked();
  await expect(cuisines.and(page.locator(':checked'))).toHaveCount(0);

  await pick(page, 'cuisine', 'mexican'); // a cuisine on its own brings Food back, at a minus
  await expect(food).toBeChecked();
  expect(await partial()).toBe(true);
});

test('E08c similar cuisines share one entry; places keep their own, and old links still work', { tag: ANY }, async ({ page }) => {
  await page.goto('/?type=food&cuisine=diner'); // an old link, from before Diner joined Euromerican
  await expect(page.locator('input[name=cuisine][value=euromerican]')).toBeChecked();
  await expect(page.locator('input[name=cuisine][value=diner]')).toHaveCount(0);
  await expect(page.locator('input[name=cuisine][value=euromerican] + span')).toHaveText('Euromerican');
  await expect(page.locator('input[name=cuisine][value="southeast asian"] + span')).toHaveText('Southeast Asian');
  expect(await visibleNames(page)).toEqual(['Night Owl Diner (sample)']);
  await expect(page.locator('.card:not([hidden]) .meta')).toContainText('Diner'); // its own words on its card
  await page.goto('/?type=food&cuisine=southeast%20asian');
  expect(await visibleNames(page)).toEqual(['Westside Phở & Bánh Mì (sample)']);
  await page.goto('/');
  await page.locator('input[name=q]').fill('vietnamese'); // search still knows the specific cuisine
  await expect(page.locator('#count')).toHaveText('1 place');
});

test('E16b hovering a dot lights it and its name together', { tag: ANY }, async ({ page }) => {
  await page.goto('/');
  await waitForMap(page);
  const dot = page.locator('.maplibregl-marker.map-dot-place[aria-label="Little Five Slice (sample)"]');
  await dot.hover();
  await expect(dot).toHaveClass(/is-hover/);
  await expect(page.locator('#map')).toHaveAttribute('data-highlight', 'little-five-slice');
  await page.mouse.move(5, 5); // away
  await expect(dot).not.toHaveClass(/is-hover/);
  await expect(page.locator('#map')).toHaveAttribute('data-highlight', '');
});

test.describe('fast food', { tag: ANY }, () => {
  test.use({ freshVisitor: true });

  test('E08d Fast Food sits under Food but starts unticked; Food shows a minus for it', async ({ page }) => {
    await page.clock.setFixedTime(new Date('2026-11-14T00:00:00Z')); // Friday, 7 PM: the fast food spot is open
    await page.goto('/?night=now');
    const fast = page.locator('input[name=cuisine][value="fast food"]');
    const food = page.locator('input[name=type][value=food]');
    await expect(fast).not.toBeChecked();
    await expect(page.locator('input[name=cuisine][value=coffee]')).toHaveCount(0); // only food places' cuisines (not the café's)…
    await expect(food).toBeChecked();
    expect(await food.evaluate((b: HTMLInputElement) => b.indeterminate)).toBe(true); // …and Food has a minus: all but fast food
    await expect(page.locator('.chip-menu[data-filter=type] summary')).toHaveAccessibleName('Type: 4 picked'); // Bar, Club, Café, Food
    expect(await visibleNames(page)).not.toContain('Cook Spot (sample)');
    expect(page.url()).not.toContain('cuisine='); // the usual food is the default
    await pick(page, 'cuisine', 'fast food');
    expect(await visibleNames(page)).toContain('Cook Spot (sample)');
    await expect(page).toHaveURL(/cuisine=all/); // every cuisine, now
    await page.goto('/'); // remembered between visits (a plain visit, not a shared link)
    await expect(fast).toBeChecked();
  });
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
  await pick(page, 'cuisine', 'pizza'); // just Pizza, under Food
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
  // Desktop: one row of chips. Phones: one row of icons, each over a one-word label.
  expect((await page.locator('#filters').boundingBox())!.height).toBeLessThanOrEqual(52);
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

  test('E22 the map runs edge to edge, and search floats over its bottom, staying put in the list', async ({ page }) => {
    await page.goto('/');
    const input = page.locator('input[name=q]');
    await expect(input).toBeVisible();
    const box = (await input.boundingBox())!;
    const map = (await page.locator('#map').boundingBox())!;
    const vh = page.viewportSize()!.height;
    expect(box.y + box.height).toBeGreaterThan(vh - 48); // at the bottom of the screen
    expect(box.y).toBeGreaterThan(map.y);
    expect(box.y).toBeLessThan(map.y + map.height); // over the map
    expect(map.x).toBe(0); // edge to edge…
    expect(map.width).toBe(page.viewportSize()!.width);
    expect(map.y + map.height).toBeCloseTo(vh, 0); // …and down to the bottom of the screen
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

  test('E23 opens on the map, with the list tucked away to the right', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#map')).toBeVisible();
    await expect(page.locator('#list-panel')).toBeHidden();
    await expect(page.locator('#list-tab')).toHaveAttribute('aria-expanded', 'false');
    await expect(page.locator('#list-tab')).toBeVisible();
    await expect(page.locator('#count')).toBeHidden(); // the count is in the list's tray
    await expect(page.locator('.maplibregl-marker.map-dot-place')).toHaveCount(8);
    expect(await page.evaluate(() => document.scrollingElement!.scrollHeight <= innerHeight)).toBe(true); // no page scroll
  });

  test('E24 the list slides over the map, and is dismissed by close, the dimmed map, Escape or a swipe', async ({ page }) => {
    await page.goto('/');
    const panel = page.locator('#list-panel');
    const explorer = page.locator('#explorer');
    await showList(page);
    const box = (await panel.boundingBox())!;
    const map = (await page.locator('#map').boundingBox())!;
    expect(box.x + box.width).toBeCloseTo(map.x + map.width, 0); // flush with the map's right edge
    expect(box.x).toBeGreaterThan(map.x + 20); // a strip of map still shows on the left
    await expect(page.locator('#list-close')).toBeFocused();

    await page.click('#list-close');
    await expect(explorer).toHaveAttribute('data-list', 'closed');
    await expect(page.locator('#list-tab')).toBeFocused();

    await showList(page);
    await page.mouse.click(map.x + 8, map.y + map.height / 2); // the dimmed map
    await expect(explorer).toHaveAttribute('data-list', 'closed');

    await showList(page);
    await page.keyboard.press('Escape');
    await expect(explorer).toHaveAttribute('data-list', 'closed');

    await showList(page);
    const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
    await swipe(page, mid, { x: mid.x + 30, y: mid.y }); // too short: snaps back
    await expect(explorer).toHaveAttribute('data-list', 'open');
    await swipe(page, mid, { x: mid.x + 150, y: mid.y });
    await expect(explorer).toHaveAttribute('data-list', 'closed');
    await expect(panel).toBeHidden();
  });

  test('E24b dragging the edge tab brings the list over', async ({ page }) => {
    await page.goto('/');
    const tab = (await page.locator('#list-tab').boundingBox())!;
    const from = { x: tab.x + tab.width / 2, y: tab.y + tab.height / 2 };
    await swipe(page, from, { x: from.x - 160, y: from.y });
    await expect(page.locator('#explorer')).toHaveAttribute('data-list', 'open');
    await expect(page.locator('#list-panel')).toBeVisible();
  });

  test('E24c the tray shows the count only when the list runs past the fold', async ({ page }) => {
    await page.goto('/?type=all');
    await showList(page);
    await expect(page.locator('#list-count')).toHaveText(/^\d+ places$/);
    await expect(page.locator('#list-count')).toHaveText((await page.locator('#count').textContent())!);
    await page.locator('input[name=q]').fill('pizza');
    await expect(page.locator('#list-count')).toHaveText('');
  });

  test('E24d filter menus float over a dimmed map as separate pills; switching swaps them; a tap away closes', async ({ page }) => {
    await page.goto('/');
    const explorer = page.locator('#explorer');
    const start = (await explorer.boundingBox())!.y;

    await page.locator('#when-menu summary').click();
    await expect(explorer).toHaveClass(/is-dimmed/);
    expect((await explorer.boundingBox())!.y).toBe(start); // the map stays put
    const panel = page.locator('#when-menu .menu-panel');
    expect(await panel.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe('rgba(0, 0, 0, 0)'); // no panel behind them
    const tonight = page.locator('#when-menu .pill', { hasText: 'Tonight' }).locator('span');
    expect(await tonight.evaluate((el) => getComputedStyle(el).boxShadow)).not.toBe('none'); // each pill floats

    // Straight to Type: its options, as pills, take the place of When's; still dimmed.
    await page.locator('.chip-menu[data-filter=type] summary').click();
    await expect(page.locator('#when-menu')).not.toHaveAttribute('open');
    await expect(page.locator('.chip-menu[data-filter=type] .menu-option').first()).toBeVisible();
    await expect(explorer).toHaveClass(/is-dimmed/);

    // A tap on the map (around the pills) closes it.
    await page.mouse.click(page.viewportSize()!.width - 100, 20); // up by the logo, where the map shows through
    await expect(page.locator('.chip-menu[data-filter=type]')).not.toHaveAttribute('open');
    await expect(explorer).not.toHaveClass(/is-dimmed/);
  });

  test('E24e a popup always fits on screen, clear of the chips and the search box', async ({ page }) => {
    await page.goto('/?type=all');
    await waitForMap(page);
    const vw = page.viewportSize()!.width;
    const n = await page.locator('.maplibregl-marker.map-dot-place').count();
    for (let i = 0; i < n; i++) {
      const dot = page.locator('.maplibregl-marker.map-dot-place').nth(i);
      await dot.dispatchEvent('click'); // some dots overlap on the smallest screen
      const popup = page.locator('.maplibregl-popup');
      await expect(popup).toBeVisible();
      const name = await dot.getAttribute('aria-label');
      const inView = async () => {
        const p = (await popup.boundingBox())!;
        const chips = (await page.locator('#toolbar').boundingBox())!;
        const search = (await page.locator('#search-box').boundingBox())!;
        const btns = await page.locator('.maplibregl-ctrl-top-left > .maplibregl-ctrl').evaluateAll((els) => {
          const rs = els.map((e) => e.getBoundingClientRect());
          return { left: Math.min(...rs.map((r) => r.left)), bottom: Math.max(...rs.map((r) => r.bottom)) };
        });
        const clearOfButtons = p.x + p.width <= btns.left || p.y >= btns.bottom; // +, − and Near me
        return p.x >= 0 && p.x + p.width <= vw && p.y >= chips.y + chips.height && p.y + p.height <= search.y && clearOfButtons;
      };
      await expect.poll(inView, { message: `${name}'s popup, on screen` }).toBe(true);
      await page.locator('.maplibregl-popup-close-button').click();
    }
  });

  test('E25 first result is visible without scrolling, once on the list', async ({ page }) => {
    await page.goto('/');
    await showList(page);
    const box = await page.locator('.card:not([hidden])').first().boundingBox();
    expect(box!.y + 60).toBeLessThan(page.viewportSize()!.height);
  });

  test("E26 a card's Map button closes the list and shows the place", async ({ page }) => {
    await page.goto('/');
    await showList(page);
    await expect(page.locator('#list')).toBeVisible();
    await page.locator('.card:not([hidden]) .locate').first().click();
    await expect(page.locator('#explorer')).toHaveAttribute('data-list', 'closed');
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
