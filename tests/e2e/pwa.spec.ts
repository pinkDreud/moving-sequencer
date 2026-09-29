import { expect, test } from '@playwright/test';

test.describe('PWA', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'Service worker checks run on Chromium');

  test('links a manifest with the expected fields', async ({ page, request }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="manifest"]').getAttribute('href');
    expect(href).toBeTruthy();
    const manifest = await (await request.get(new URL(href!, page.url()).toString())).json();
    expect(manifest).toMatchObject({
      name: 'Moving Sequencer',
      short_name: 'Sequencer',
      display: 'standalone',
      start_url: '/moving-sequencer/',
      scope: '/moving-sequencer/',
    });
    const sizes = manifest.icons.map(
      (i: { sizes: string; purpose?: string }) => `${i.sizes}:${i.purpose ?? 'any'}`,
    );
    expect(sizes).toEqual(expect.arrayContaining(['192x192:any', '512x512:any', '512x512:maskable']));
    for (const icon of manifest.icons as { src: string }[]) {
      expect((await request.get(new URL(icon.src, page.url()).toString())).ok()).toBe(true);
    }
  });

  test('has an apple-touch-icon', async ({ page, request }) => {
    await page.goto('./');
    const href = await page.locator('link[rel="apple-touch-icon"]').getAttribute('href');
    expect((await request.get(new URL(href!, page.url()).toString())).ok()).toBe(true);
  });

  test('works offline after the first visit', async ({ page, context }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    // The first load happened before the worker controlled the page; reload once so it serves from cache.
    await page.reload();
    await expect.poll(() => page.evaluate(() => navigator.serviceWorker.controller !== null)).toBe(true);
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Moving Sequencer' })).toBeVisible();
    await expect(page.getByRole('region', { name: 'Pattern' })).toBeVisible();
  });
});
