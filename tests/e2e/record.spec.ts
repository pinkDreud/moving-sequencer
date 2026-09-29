import { expect, test, type Page } from '@playwright/test';
import { storedKeys, storedSong } from './storage';

const palette = (page: Page) => page.getByRole('group', { name: 'Sounds' });
const paletteButton = (page: Page, name: string) => palette(page).getByRole('button', { name, exact: true });
const slots = (page: Page) =>
  page.getByRole('region', { name: 'Pattern' }).locator(':scope > [data-node-id]');

/** Ids and peaks of the recordings loaded into the fake engine. */
const loadedRecordings = (page: Page) =>
  page.evaluate(() =>
    [...(window.__seqTest?.engine.loaded ?? new Map<string, AudioBuffer>())]
      .filter(([id]) => id.startsWith('rec-'))
      .map(([id, buffer]) => ({
        id,
        channels: buffer.numberOfChannels,
        duration: buffer.duration,
        peak: buffer.getChannelData(0).reduce((max, x) => Math.max(max, Math.abs(x)), 0),
      })),
  );

test.describe('with the fake microphone', () => {
  test.skip(
    ({ browserName, isMobile }) => browserName !== 'chromium' || isMobile,
    'the fake media device flags are only set on the (desktop) chromium project',
  );

  test('records Rec 1, puts it on a square, plays it, then deletes it', async ({ page }) => {
    await page.goto('./?fake-audio');
    await expect(slots(page)).toHaveCount(8);

    await paletteButton(page, 'Record').click();
    const stop = page.getByRole('button', { name: 'Stop recording' });
    await expect(stop).toBeVisible();
    await expect(stop).toContainText(/[1-3]\.\d s/, { timeout: 5_000 });
    await stop.click();

    await expect(paletteButton(page, 'Rec 1')).toBeVisible({ timeout: 10_000 });
    await expect(paletteButton(page, 'Record')).toBeEnabled();
    const [loaded] = await loadedRecordings(page);
    expect(loaded?.channels).toBe(1);
    expect(loaded?.duration).toBeGreaterThan(0);
    expect(loaded?.duration).toBeLessThan(4);
    expect(loaded?.peak).toBeCloseTo(0.891, 2); // normalized to -1 dBFS

    await paletteButton(page, 'Rec 1').click();
    await expect(slots(page)).toHaveCount(9);
    await expect(slots(page).nth(8)).toHaveAttribute('aria-label', 'Rec 1');

    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await expect
      .poll(
        () => page.evaluate(() => window.__seqTest?.engine.log.some((e) => e.soundId.startsWith('rec-'))),
        {
          timeout: 10_000,
        },
      )
      .toBe(true);
    await page.getByRole('button', { name: 'Stop', exact: true }).click();

    await paletteButton(page, 'Delete Rec 1').click();
    await paletteButton(page, 'Confirm delete Rec 1').click();
    await expect(paletteButton(page, 'Rec 1')).toHaveCount(0);
    await expect(slots(page)).toHaveCount(9);
    await expect(slots(page).nth(8)).toHaveAttribute('aria-label', 'silent');
    expect(await loadedRecordings(page)).toEqual([]);
  });

  test('recording while playing stops by itself after 4 s and keeps playing', async ({ page }) => {
    await page.goto('./?fake-audio');
    await page.getByRole('button', { name: 'Play', exact: true }).click();
    await paletteButton(page, 'Record').click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toBeVisible();
    await expect(paletteButton(page, 'Rec 1')).toBeVisible({ timeout: 10_000 });
    const [loaded] = await loadedRecordings(page);
    expect(loaded?.duration).toBeGreaterThan(2.5); // ran to the 4 s limit, minus at most 1 s of trimmed silence
    await expect(page.getByRole('button', { name: 'Stop', exact: true })).toBeVisible(); // still playing
  });

  test('a recording and the squares using it survive a reload; a deleted one is gone after a reload', async ({
    page,
  }) => {
    await page.goto('./?fake-audio');
    await paletteButton(page, 'Record').click();
    await expect(page.getByRole('button', { name: 'Stop recording' })).toContainText(/[1-3]\.\d s/, {
      timeout: 5_000,
    });
    await page.getByRole('button', { name: 'Stop recording' }).click();
    await paletteButton(page, 'Rec 1').click();
    await expect(slots(page)).toHaveCount(9);
    const [recorded] = await loadedRecordings(page);
    const id = recorded?.id ?? 'missing';
    await expect.poll(() => storedKeys(page), { timeout: 5_000 }).toContain(`recording:${id}`);
    await expect.poll(async () => JSON.stringify(await storedSong(page)), { timeout: 5_000 }).toContain(id);

    await page.reload();
    await expect(paletteButton(page, 'Rec 1')).toBeVisible();
    await expect(slots(page).nth(8)).toHaveAttribute('aria-label', 'Rec 1');
    const [restored] = await loadedRecordings(page);
    expect(restored?.id).toBe(id);
    expect(restored?.peak).toBeCloseTo(0.891, 2);

    await paletteButton(page, 'Delete Rec 1').click();
    await paletteButton(page, 'Confirm delete Rec 1').click();
    await expect(slots(page).nth(8)).toHaveAttribute('aria-label', 'silent');
    await expect.poll(() => storedKeys(page), { timeout: 5_000 }).not.toContain(`recording:${id}`);
    await expect
      .poll(async () => JSON.stringify(await storedSong(page)), { timeout: 5_000 })
      .not.toContain(id);

    await page.reload();
    await expect(slots(page)).toHaveCount(9);
    await expect(slots(page).nth(8)).toHaveAttribute('aria-label', 'silent');
    await expect(paletteButton(page, 'Rec 1')).toHaveCount(0);
  });
});

test('a denied mic permission shows an inline message and the app keeps working', async ({ page }) => {
  await page.addInitScript(() => {
    const getUserMedia = () => Promise.reject(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', { value: { getUserMedia }, configurable: true });
    // Some WebKit builds have no MediaRecorder, which would disable Record before getUserMedia is reached.
    if (!('MediaRecorder' in window)) {
      Object.defineProperty(window, 'MediaRecorder', { value: class {}, configurable: true });
    }
  });
  await page.goto('./?fake-audio');
  const dialogs: string[] = [];
  page.on('dialog', (d) => dialogs.push(d.message()));

  // The live region is rendered (not display:none) before the message, or screen readers may not announce it.
  await expect(palette(page).getByRole('status')).toHaveCount(1);
  await paletteButton(page, 'Record').click();
  await expect(palette(page).getByRole('status')).toHaveText('Microphone permission denied');
  await expect(paletteButton(page, 'Record')).toBeEnabled();

  await paletteButton(page, 'Clap').click();
  await expect(slots(page)).toHaveCount(9);
  expect(dialogs).toEqual([]);
});

test('the Record button is a ≥ 44 px touch target and fits a 360 px wide screen', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('./?fake-audio');
  const box = await paletteButton(page, 'Record').boundingBox();
  expect(box?.height).toBeGreaterThanOrEqual(44);
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(360);
});
