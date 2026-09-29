import { expect, test, type Page } from '@playwright/test';

const DEFAULT_PATTERN = ['kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'hat'];

const scheduled = (page: Page) =>
  page.evaluate(() => window.__seqTest?.engine.log.map(({ soundId, when }) => ({ soundId, when })) ?? []);
const appState = (page: Page) =>
  page.evaluate(() => {
    const app = window.__seqTest?.app;
    return { playing: app?.playing, playheadId: app?.playheadId, bpm: app?.song.bpm };
  });

test.beforeEach(async ({ page }) => {
  await page.goto('./?fake-audio');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
});

test('Play schedules the default pattern in order; Stop stops', async ({ page }) => {
  const play = page.getByRole('button', { name: 'Play' });
  await expect(play).toHaveAttribute('aria-pressed', 'false');
  await play.click();

  const stop = page.getByRole('button', { name: 'Stop' });
  await expect(stop).toHaveAttribute('aria-pressed', 'true');
  await expect
    .poll(async () => (await scheduled(page)).length, { timeout: 10_000 })
    .toBeGreaterThanOrEqual(8);

  const first8 = (await scheduled(page)).slice(0, 8);
  expect(first8.map((e) => e.soundId)).toEqual(DEFAULT_PATTERN);
  for (let i = 1; i < first8.length; i++)
    expect(first8[i]?.when).toBeGreaterThan(first8[i - 1]?.when ?? Infinity);

  const playing = await appState(page);
  expect(playing.playing).toBe(true);
  expect(playing.playheadId).toEqual(expect.any(String));

  await stop.click();
  await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'false');
  expect(await appState(page)).toMatchObject({ playing: false, playheadId: null });
});

test('Space toggles play/stop, also with the Play button focused, but not while typing the BPM', async ({
  page,
}) => {
  await page.keyboard.press('Space');
  await expect.poll(async () => (await appState(page)).playing).toBe(true);

  // Focus the button (it now reads "Stop"): Space must toggle once, not toggle and also press the button.
  await page.getByRole('button', { name: 'Stop' }).focus();
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  expect((await appState(page)).playing).toBe(false);

  const bpm = page.getByRole('spinbutton', { name: 'BPM' });
  await bpm.focus();
  await page.keyboard.press('Space');
  expect((await appState(page)).playing).toBe(false);
});

test('BPM is clamped on commit and the slot value can be changed', async ({ page }) => {
  const bpm = page.getByRole('spinbutton', { name: 'BPM' });
  await bpm.fill('999');
  await bpm.press('Enter');
  await expect(bpm).toHaveValue('300');
  expect((await appState(page)).bpm).toBe(300);

  await page.getByRole('combobox', { name: 'Slot value' }).selectOption('1/16');
  expect(await page.evaluate(() => window.__seqTest?.app.song.slotValue)).toBe(16);
});
