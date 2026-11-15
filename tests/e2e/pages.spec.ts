import { test, expect, places, waitForMap, ANY } from './fixtures';

for (const place of places) {
  test(`P01 place page: ${place.id}`, { tag: ANY }, async ({ page }) => {
    const res = await page.goto(`/places/${place.id}/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText(place.name);
    await expect(page.locator('#status')).toHaveText(/Open|Closed|Not open yet/);
    await expect(page.getByRole('link', { name: /^Directions/ })).toHaveAttribute('href', /google\.com\/maps|maps\.apple\.com/);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(ld.name).toBe(place.name);
    await waitForMap(page);
  });
}

test('P02b a place that opens later tonight says when', { tag: ANY }, async ({ page }) => {
  await page.goto('/places/castleberry-late-lounge/'); // 8:30 PM Friday
  await expect(page.locator('#status')).toHaveText('Not open yet · opens 10 PM');
  await expect(page.locator('#status-line')).toHaveClass(/not-yet/);
});

test('P02 place page highlights today and shows live status', { tag: ANY }, async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-14T03:30:00Z')); // Friday, 10:30 PM: the lounge is open
  await page.goto('/places/castleberry-late-lounge/');
  await expect(page.locator('tr.today th')).toHaveText('Friday');
  await expect(page.locator('#status')).toHaveText('Open now · closes 4 AM');
});

test('P03 Directions opens your platform\'s maps app, and offers the other', async ({ page, isMobile }) => {
  // The phone projects are iPhones; the desktop project reports Windows.
  await page.goto('/places/night-owl-diner/');
  const apple = 'https://maps.apple.com/?daddr=100%20Example%20St%20NE%2C%20Atlanta%2C%20GA%2030308';
  const google = 'https://www.google.com/maps/dir/?api=1&destination=100%20Example%20St%20NE%2C%20Atlanta%2C%20GA%2030308';
  await expect(page.getByRole('link', { name: /^Directions/ })).toHaveAttribute('href', isMobile ? apple : google);
  const other = page.locator('#other-maps');
  await expect(other).toHaveText(isMobile ? 'Google Maps' : 'Apple Maps');
  await expect(other).toHaveAttribute('href', isMobile ? google : apple);
});

test('P04 Directions and Call buttons show the address and number', { tag: ANY }, async ({ page }) => {
  await page.goto('/places/night-owl-diner/');
  const directions = page.getByRole('link', { name: /^Directions/ });
  await expect(directions).toContainText('100 Example St NE, Atlanta');
  await expect(directions).not.toContainText('GA 30308');
  await expect(page.locator('.place-info section')).not.toContainText('100 Example St'); // not repeated below
});

test('P05 place page shows "good to know" tags', { tag: ANY }, async ({ page }) => {
  await page.goto('/places/castleberry-late-lounge/');
  await expect(page.getByRole('list', { name: 'Good to know' }).getByRole('listitem')).toHaveText(['Cover charge', '21+']);
  await page.goto('/places/night-owl-diner/'); // untagged: no empty row
  await expect(page.locator('.tags')).toHaveCount(0);
});

test('P06 place page lists its sources by site name', { tag: ANY }, async ({ page }) => {
  await page.goto('/places/castleberry-late-lounge/');
  const sources = page.locator('.verified .sources');
  await expect(sources).toHaveText('Sources: example.com, example.org.');
  await expect(page.locator('.verified')).toContainText('2026. Sources:'); // spaced from the date
  await expect(sources.getByRole('link', { name: 'example.com' })).toHaveAttribute('href', 'https://www.example.com/castleberry/hours');
  await page.goto('/places/night-owl-diner/'); // no sources: no empty "Sources:"
  await expect(page.locator('.verified .sources')).toHaveCount(0);
});

test.describe('your location on a place page', { tag: ANY }, () => {
  test.describe('already allowed', () => {
    test.use({ permissions: ['geolocation'], geolocation: { latitude: 33.7645, longitude: -84.3493 } }); // Little Five Points

    test('P07 shows you and the distance without asking', async ({ page }) => {
      await page.goto('/places/castleberry-late-lounge/');
      await expect(page.locator('#away')).toHaveText(/^ · \d+(\.\d)? mi away$/);
      await expect(page.locator('.map-dot-you')).toBeAttached();
      await expect(page.locator('.map-locate')).toHaveAttribute('aria-pressed', 'true');
      await page.click('.map-locate'); // toggle off
      await expect(page.locator('#away')).toBeHidden();
      await expect(page.locator('.map-dot-you')).toHaveCount(0);
    });

    test('P08 Drive / Walk fetch a route only when asked', async ({ page }) => {
      const requests: string[] = [];
      page.on('request', (r) => r.url().includes('valhalla1') && requests.push(decodeURIComponent(r.url())));
      await page.goto('/places/poncey-24-pharmacy/'); // 0.7 mi away: walkable
      await expect(page.locator('#route')).toBeVisible(); // offered once your location shows…
      expect(requests).toEqual([]); // …but nothing is sent until you pick one
      const drive = page.getByRole('button', { name: /^Drive/ });
      const walk = page.getByRole('button', { name: /^Walk/ });
      // Times straight away: estimates from the distance (no request needed).
      await expect(drive).toHaveText(/^Drive · ~\d+ min$/);
      await expect(walk).toHaveText(/^Walk · ~\d+ min$/);
      await drive.click();
      await expect(page.locator('#route-summary')).toHaveText('About 2 min · 0.9 mi');
      await expect(drive).toHaveText('Drive · 2 min'); // the route's own time replaces the estimate
      await expect(walk).toHaveText(/~/); // still an estimate
      await expect(page.locator('#route-note')).toContainText('receives your location');
      expect(requests).toHaveLength(1);
      expect(requests[0]).toContain('"costing":"auto"');
      await walk.click();
      await expect.poll(() => requests.length).toBe(2);
      expect(requests[1]).toContain('"costing":"pedestrian"');
      await drive.click(); // cached: no new request
      await drive.click(); // again: hides it
      await expect(page.locator('#route-summary')).toHaveText('');
      expect(requests).toHaveLength(2);
    });

    test('P08b Walk is only offered within 1.5 miles', async ({ page }) => {
      await page.goto('/places/edgewood-hi-fi/'); // 1.6 mi away: just too far
      await expect(page.getByRole('button', { name: /^Drive/ })).toHaveText(/^Drive · ~\d+ min$/);
      await expect(page.getByRole('button', { name: /^Walk/ })).toBeHidden();
    });

    test('P09 a failed route says so and points to Directions', async ({ page, consoleErrors }) => {
      await page.route(/valhalla1/, (r) => r.fulfill({ status: 500, body: '' }));
      await page.goto('/places/castleberry-late-lounge/');
      await page.getByRole('button', { name: /^Drive/ }).click();
      await expect(page.locator('#route-summary')).toContainText('Couldn’t get a route');
      consoleErrors.length = 0; // the browser logs the simulated server error itself
    });
  });

  test('P10 not allowed: no prompt on load; the button explains a refusal', async ({ page }) => {
    await page.goto('/places/castleberry-late-lounge/');
    await expect(page.locator('.map-locate')).toBeVisible();
    await expect(page.locator('#away')).toBeHidden();
    await page.click('.map-locate');
    await expect(page.locator('#geo-msg')).toContainText('Location is blocked for this site');
    await expect(page.locator('.map-dot-you')).toHaveCount(0);
  });
});

test('P11 unknown URLs get the 404 page', { tag: ANY }, async ({ page, consoleErrors }) => {
  const res = await page.goto('/nope/');
  expect(res?.status()).toBe(404);
  consoleErrors.length = 0; // the browser logs the 404 status, which is expected here
  await expect(page.locator('h1')).toHaveText('Nothing open here');
});
