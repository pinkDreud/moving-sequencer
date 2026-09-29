import { expect, test, type Page } from '@playwright/test';
import { storedKeys, storedSong, storeValue } from './storage';

const slots = (page: Page) =>
  page.getByRole('region', { name: 'Pattern' }).locator(':scope > [data-node-id]');
const paletteButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Sounds' }).getByRole('button', { name, exact: true });
const bpm = (page: Page) => page.getByRole('spinbutton', { name: 'BPM' });

function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('dialog', (d) => errors.push(`dialog: ${d.message()}`));
  return errors;
}

test('an added square and a new BPM survive a reload', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('./?fake-audio');
  await expect(slots(page)).toHaveCount(8);

  await paletteButton(page, 'Clap').click();
  await bpm(page).fill('140');
  await bpm(page).press('Enter');
  await expect.poll(async () => (await storedSong(page))?.bpm, { timeout: 5_000 }).toBe(140);
  await expect.poll(async () => JSON.stringify(await storedSong(page))).toContain('"clap"');

  await page.reload();
  await expect(slots(page)).toHaveCount(9);
  await expect(slots(page).nth(8)).toHaveAttribute('aria-label', 'Clap');
  await expect(bpm(page)).toHaveValue('140');
  expect(errors).toEqual([]);
});

test('nothing is written until the user edits', async ({ page }) => {
  await page.goto('./?fake-audio');
  await expect(slots(page)).toHaveCount(8);
  await page.waitForTimeout(800); // longer than the 500 ms autosave delay
  expect(await storedKeys(page)).toEqual([]);
});

test('an invalid stored song falls back to the default pattern and is kept until the user edits', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await page.goto('./?fake-audio');
  await expect(slots(page)).toHaveCount(8);
  await storeValue(page, 'song', { version: 99, bpm: 'fast' });

  await page.reload();
  await expect(slots(page)).toHaveCount(8);
  await expect(bpm(page)).toHaveValue('110');
  await page.waitForTimeout(800);
  expect(await storedSong(page)).toEqual({ version: 99, bpm: 'fast' });
  expect(errors).toEqual([]);
});

test('without IndexedDB the app still works, without errors', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true });
  });
  const errors = collectErrors(page);
  await page.goto('./?fake-audio');
  await expect(slots(page)).toHaveCount(8);
  await paletteButton(page, 'Rim').click();
  await expect(slots(page)).toHaveCount(9);
  await page.waitForTimeout(800);
  expect(errors).toEqual([]);
});
