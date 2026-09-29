import { expect, test, type Locator, type Page } from '@playwright/test';

const strip = (page: Page) => page.getByRole('region', { name: 'Pattern' });
const slots = (page: Page) => strip(page).locator(':scope > [data-node-id]');
const paletteButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Sounds' }).getByRole('button', { name, exact: true });
const barButton = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name, exact: true });

test('loads the default 8-slot beat', async ({ page }) => {
  await page.goto('./');
  await expect(slots(page)).toHaveCount(8);
  await expect(slots(page).first()).toHaveAttribute('aria-label', 'Kick');
});

test('adds squares from the palette, groups three, ungroups them and deletes them', async ({
  page,
  isMobile,
}) => {
  // Mouse: first click selects, shift-click adds. Touch: every tap toggles.
  const pick = async (target: Locator, first: boolean) => {
    if (isMobile) await target.tap();
    else await target.click(first ? {} : { modifiers: ['ControlOrMeta'] });
  };

  await page.goto('./');
  await expect(slots(page)).toHaveCount(8);

  await paletteButton(page, 'Clap').click();
  await paletteButton(page, 'Silent').click();
  await paletteButton(page, 'Rim').click();
  await expect(slots(page)).toHaveCount(11);
  await expect(slots(page).nth(8)).toHaveAttribute('aria-label', 'Clap');
  await expect(slots(page).nth(9)).toHaveAttribute('aria-label', 'silent');
  await expect(slots(page).nth(10)).toHaveAttribute('aria-label', 'Rim');

  await pick(slots(page).nth(8), true);
  await pick(slots(page).nth(9), false);
  await pick(slots(page).nth(10), false);
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('3 selected');
  await expect(slots(page).nth(8)).toHaveAttribute('aria-pressed', 'true');

  await barButton(page, 'Group').click();
  await expect(slots(page)).toHaveCount(9);
  const grouped = slots(page).nth(8);
  await expect(grouped.locator(':scope > .children > [data-node-id]')).toHaveCount(3);
  await expect(grouped.getByRole('button', { name: 'Group of 3' })).toHaveAttribute('aria-pressed', 'true');

  await barButton(page, 'Ungroup').click();
  await expect(slots(page)).toHaveCount(11);
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('3 selected');

  await barButton(page, 'Remove').click();
  await expect(slots(page)).toHaveCount(8);
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toHaveCount(0);
});

test('all slots have the same width, and a group splits its slot evenly', async ({ page, isMobile }) => {
  await page.goto('./');
  for (const [i, target] of [slots(page).nth(0), slots(page).nth(1), slots(page).nth(2)].entries()) {
    if (isMobile) await target.tap();
    else await target.click(i === 0 ? {} : { modifiers: ['ControlOrMeta'] });
  }
  await barButton(page, 'Group').click();
  await expect(slots(page)).toHaveCount(6);

  const widths = await slots(page).evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(widths[0]).toBeGreaterThanOrEqual(44);
  for (const w of widths) expect(w).toBeCloseTo(widths[0] ?? 0, 1);

  const children = slots(page).first().locator(':scope > .children > [data-node-id]');
  const childWidths = await children.evaluateAll((els) => els.map((el) => el.getBoundingClientRect().width));
  expect(childWidths).toHaveLength(3);
  for (const w of childWidths) expect(w).toBeCloseTo(childWidths[0] ?? 0, 1);
});

test('a tap on the empty strip area clears the selection', async ({ page, isMobile }) => {
  await page.goto('./');
  if (isMobile) await slots(page).first().tap();
  else await slots(page).first().click();
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toBeVisible();
  const box = await strip(page).boundingBox();
  if (!box) throw new Error('strip not laid out');
  // Bottom-right corner of the strip: after the last slot of the last row.
  const at = { x: box.x + box.width - 4, y: box.y + box.height - 4 };
  if (isMobile) await page.touchscreen.tap(at.x, at.y);
  else await page.mouse.click(at.x, at.y);
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toHaveCount(0);
});

test('fits a 360 px wide phone without horizontal scroll, slots stay ≥ 44 px', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('./');
  await slots(page).first().click();
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
  const box = await slots(page).first().boundingBox();
  expect(box?.width).toBeGreaterThanOrEqual(44);
  expect(box?.height).toBeGreaterThanOrEqual(44);
});

test('issue #1: click a square, then a sample: the sound goes into that square', async ({
  page,
  isMobile,
}) => {
  await page.goto('./');
  await paletteButton(page, 'Clap').click();
  await expect(slots(page)).toHaveCount(9);
  const target = slots(page).nth(3);
  if (isMobile) await target.tap();
  else await target.click();
  await paletteButton(page, 'Rim').click();
  await expect(slots(page)).toHaveCount(9);
  await expect(slots(page).nth(3)).toHaveAttribute('aria-label', 'Rim');
  await expect(slots(page).nth(4)).not.toHaveAttribute('aria-label', 'Rim');
});

test('shift+click selects a range; Delete empties it; Ins adds an empty slot before', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Keyboard and shift+click need a desktop');
  await page.goto('./');
  await slots(page).nth(1).click();
  await slots(page)
    .nth(4)
    .click({ modifiers: ['Shift'] });
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('4 selected');

  await page.keyboard.press('Delete');
  await expect(slots(page)).toHaveCount(8);
  for (const i of [1, 2, 3, 4]) await expect(slots(page).nth(i)).toHaveAttribute('aria-label', 'silent');
  await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('4 selected');

  await slots(page).nth(6).click();
  await page.keyboard.press('Insert');
  await expect(slots(page)).toHaveCount(9);
  await expect(slots(page).nth(6)).toHaveAttribute('aria-label', 'silent');
  await expect(slots(page).nth(7)).toHaveAttribute('aria-pressed', 'true');
});
