import { appendFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
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

  test('after a deploy, an open page offers to reload into the new version', async ({ page }) => {
    await page.goto('./');
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => undefined));
    await page.reload();
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
    await expect(page.getByText('New version available')).toHaveCount(0);

    // Simulate a deploy: the preview server serves dist/ from disk, and any byte change makes a new worker.
    appendFileSync(
      fileURLToPath(new URL('../../dist/sw.js', import.meta.url)),
      `\n// deploy ${Date.now()}\n`,
    );
    // Coming back to the foreground makes the page look for a new version.
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await expect(page.getByText('New version available')).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Reload' }).click();
    await expect(page.getByRole('heading', { name: 'Moving Sequencer' })).toBeVisible();
    await expect(page.getByText('New version available')).toHaveCount(0);
  });
});
