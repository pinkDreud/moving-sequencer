import { expect, test, type Page } from '@playwright/test';
import { storedSong } from './storage';

const slots = (page: Page) =>
  page.getByRole('region', { name: 'Pattern' }).locator(':scope > [data-node-id]');
const paletteButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Sounds' }).getByRole('button', { name, exact: true });
const tab = (page: Page, name: string) => page.getByRole('tab', { name, exact: true });

/** When each sound was scheduled, in time order: `claps` for the second track, `master` for everything else. */
const scheduled = (page: Page) =>
  page.evaluate(() => {
    const log = [...(window.__seqTest?.engine.log ?? [])].sort((a, b) => a.when - b.when);
    return {
      claps: log.filter((e) => e.soundId === 'clap').map((e) => e.when),
      master: log.filter((e) => e.soundId !== 'clap').map((e) => e.when),
    };
  });

/** A second track of three claps, left as the tab shown. */
async function addClapTrack(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Add track' }).click();
  await expect(tab(page, 'Track 2')).toHaveAttribute('aria-selected', 'true');
  await expect(slots(page)).toHaveCount(0);
  for (let i = 1; i <= 3; i++) {
    await paletteButton(page, 'Clap').click();
    await expect(slots(page)).toHaveCount(i);
  }
}

async function playUntilSecondLoop(page: Page) {
  await page.getByRole('button', { name: 'Play' }).click();
  await expect
    .poll(async () => (await scheduled(page)).master.length, { timeout: 15_000 })
    .toBeGreaterThan(9);
  await page.getByRole('button', { name: 'Stop' }).click();
  return scheduled(page);
}

test.beforeEach(async ({ page }) => {
  await page.goto('./?fake-audio');
  await expect(slots(page)).toHaveCount(8);
});

test('each tab shows its own track and edits only that one', async ({ page }) => {
  await expect(tab(page, 'Master')).toHaveAttribute('aria-selected', 'true');
  await addClapTrack(page);
  await tab(page, 'Master').click();
  await expect(slots(page)).toHaveCount(8);
  await expect(slots(page).first()).toHaveAttribute('aria-label', 'Kick');
  await tab(page, 'Track 2').click();
  await expect(slots(page)).toHaveCount(3);
  await expect(slots(page).first()).toHaveAttribute('aria-label', 'Clap');
});

test('a second track plays together with the master, slot for slot', async ({ page }) => {
  await addClapTrack(page);
  const { claps, master } = await playUntilSecondLoop(page);
  const slot = (master[1] ?? NaN) - (master[0] ?? NaN);
  expect(slot).toBeGreaterThan(0);
  expect(claps.length).toBeGreaterThanOrEqual(8);
  // Both tracks start together, and a clap falls on every master slot (the 3-slot track just loops sooner).
  for (let i = 0; i < 8; i++) expect(claps[i]).toBeCloseTo((master[0] ?? NaN) + i * slot, 6);
});

test('with Same loop, the three slots of the track span the master loop', async ({ page }) => {
  await addClapTrack(page);
  await page.getByRole('radio', { name: 'Same loop' }).check();
  const { claps, master } = await playUntilSecondLoop(page);
  const slot = (master[1] ?? NaN) - (master[0] ?? NaN);
  expect(claps.length).toBeGreaterThanOrEqual(4);
  for (let i = 0; i < 4; i++) expect(claps[i]).toBeCloseTo((master[0] ?? NaN) + (i * 8 * slot) / 3, 6);
  // The fourth clap opens the second loop, together with the master's ninth slot.
  expect(claps[3]).toBeCloseTo(master[8] ?? NaN, 6);
});

test('tracks and their sync survive a reload', async ({ page }) => {
  await addClapTrack(page);
  await page.getByRole('radio', { name: 'Same loop' }).check();
  await expect.poll(async () => JSON.stringify(await storedSong(page))).toContain('"sync":"loop"');

  await page.reload();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await expect(slots(page)).toHaveCount(8);
  await tab(page, 'Track 2').click();
  await expect(slots(page)).toHaveCount(3);
  await expect(page.getByRole('radio', { name: 'Same loop' })).toBeChecked();
});

test('Remove track asks for a second press', async ({ page }) => {
  await addClapTrack(page);
  await page.getByRole('button', { name: 'Remove track' }).click();
  await expect(page.getByRole('tab')).toHaveCount(2);
  await page.getByRole('button', { name: 'Remove?' }).click();
  await expect(page.getByRole('tab')).toHaveCount(1);
  await expect(tab(page, 'Master')).toHaveAttribute('aria-selected', 'true');
  await expect(slots(page)).toHaveCount(8);
});

for (const width of [320, 360]) {
  test(`the tabs of 8 tracks fit a ${width} px screen without horizontal scroll`, async ({ page }) => {
    await page.setViewportSize({ width, height: 740 });
    for (let i = 0; i < 7; i++) await page.getByRole('button', { name: 'Add track' }).click();
    await expect(page.getByRole('tab')).toHaveCount(8);
    await expect(page.getByRole('button', { name: 'Add track' })).toBeDisabled();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}
