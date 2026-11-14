import { test, expect, places, waitForMap } from './fixtures';

for (const place of places) {
  test(`place page: ${place.id}`, async ({ page }) => {
    const res = await page.goto(`/places/${place.id}/`);
    expect(res?.status()).toBe(200);
    await expect(page.locator('h1')).toHaveText(place.name);
    await expect(page.locator('#status')).toHaveText(/Open|Closed/);
    await expect(page.getByRole('link', { name: 'Directions' })).toHaveAttribute('href', /google\.com\/maps/);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(ld.name).toBe(place.name);
    await waitForMap(page);
  });
}

test('place page highlights today and shows live status', async ({ page }) => {
  await page.goto('/places/castleberry-late-lounge/');
  await expect(page.locator('tr.today th')).toHaveText('Friday');
  await expect(page.locator('#status')).toHaveText('Open now · closes 4 AM');
});

test('unknown URLs get the 404 page', async ({ page, consoleErrors }) => {
  const res = await page.goto('/nope/');
  expect(res?.status()).toBe(404);
  consoleErrors.length = 0; // the browser logs the 404 status, which is expected here
  await expect(page.locator('h1')).toHaveText('Nothing open here');
});
