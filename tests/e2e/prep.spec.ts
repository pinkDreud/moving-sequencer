import { expect, test, type Locator, type Page } from '@playwright/test';
import { storedSong } from './storage';

type Node =
  | { kind: 'square'; id: string; soundId: string | null; muted: boolean }
  | { kind: 'group'; id: string; span: 1; children: Node[] };

/** A square whose id doubles as its kit sound id (ids must be unique across both areas). */
const sq = (id: string): Node => ({ kind: 'square', id, soundId: id, muted: false });
const grp = (id: string, ...children: Node[]): Node => ({ kind: 'group', id, span: 1, children });

const pattern = (page: Page) => page.getByRole('region', { name: 'Pattern' });
const prep = (page: Page) => page.getByRole('region', { name: 'Prepare' });
const inPattern = (page: Page, id: string) => pattern(page).locator(`[data-node-id="${id}"]`);
const inPrep = (page: Page, id: string) => prep(page).locator(`[data-node-id="${id}"]`);
const paletteButton = (page: Page, name: string) =>
  page.getByRole('group', { name: 'Sounds' }).getByRole('button', { name, exact: true });
const barButton = (page: Page, name: string) =>
  page.getByRole('toolbar', { name: 'Selection' }).getByRole('button', { name, exact: true });

/** Opens the app with fake audio and replaces the pattern and the prep area. */
async function load(page: Page, patternNodes: Node[], prepNodes: Node[] = []) {
  await page.goto('./?fake-audio');
  await page.waitForFunction(() => window.__seqTest !== undefined);
  await page.evaluate(
    ([p, q]) => {
      const app = window.__seqTest!.app;
      app.song = { ...app.song, tracks: [{ id: 't', nodes: p as never }] };
      app.prep = { id: 'prep', nodes: q as never };
      app.clearSelection();
    },
    [patternNodes, prepNodes],
  );
}

/** The rendered strip as a compact string, e.g. `kick g[snare clap] rim`. */
function shape(strip: Locator): Promise<string> {
  return strip.evaluate((el) => {
    const walk = (parent: Element): string =>
      [...parent.children]
        .filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.nodeId !== undefined)
        .map((c) => {
          const inner = c.querySelector(':scope > .children');
          return inner ? `${c.dataset.nodeId}[${walk(inner)}]` : c.dataset.nodeId;
        })
        .join(' ');
    return walk(el);
  });
}

/** Sound names (aria-labels) of the top-level slots, groups as `[a b]`. */
function sounds(strip: Locator): Promise<string> {
  return strip.evaluate((el) => {
    const walk = (parent: Element): string =>
      [...parent.children]
        .filter((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.nodeId !== undefined)
        .map((c) => {
          const inner = c.querySelector(':scope > .children');
          return inner ? `[${walk(inner)}]` : (c.getAttribute('aria-label') ?? '?');
        })
        .join(' ');
    return walk(el);
  });
}

async function at(target: Locator, fx: number, fy = 0.5) {
  const box = await target.boundingBox();
  if (!box) throw new Error('element not visible');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Mouse drag in small steps, from the center of `from` to `to`; `beforeRelease` runs with the button held. */
async function drag(
  page: Page,
  from: Locator,
  to: { x: number; y: number },
  beforeRelease?: () => Promise<void>,
) {
  const start = await at(from, 0.5);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(start.x + 10, start.y, { steps: 3 });
  await page.mouse.move(to.x, to.y, { steps: 10 });
  await beforeRelease?.();
  await page.mouse.up();
}

async function tap(page: Page, target: Locator, isMobile: boolean) {
  if (isMobile) await target.tap();
  else await target.click();
}

test('the prep area is under the pattern, labelled, empty, with a hint', async ({ page }) => {
  await page.goto('./?fake-audio');
  await expect(page.getByRole('heading', { name: 'Prepare' })).toBeVisible();
  await expect(prep(page)).toBeVisible();
  await expect(prep(page).locator('[data-node-id]')).toHaveCount(0);
  await expect(prep(page)).toContainText(/drag it into the pattern/i);
  const [a, b] = [await pattern(page).boundingBox(), await prep(page).boundingBox()];
  expect(b?.y ?? 0).toBeGreaterThan((a?.y ?? 0) + (a?.height ?? 0));
});

test('tap the prep area, then palette taps add squares there; tap the pattern to add there again', async ({
  page,
  isMobile,
}) => {
  await load(page, [sq('kick'), sq('snare')]);
  await tap(page, prep(page), isMobile);
  await paletteButton(page, 'Clap').click();
  await paletteButton(page, 'Rim').click();
  await expect.poll(() => sounds(prep(page))).toBe('Clap Rim');
  await expect.poll(() => sounds(pattern(page))).toBe('Kick Snare');
  await tap(page, pattern(page), isMobile);
  await paletteButton(page, 'Hat').click();
  await expect.poll(() => sounds(pattern(page))).toBe('Kick Snare Hat');
});

test('drag prep → pattern copies: fresh ids, the prep area unchanged', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag; touch is covered below');
  await load(page, [sq('kick'), sq('snare')], [grp('g', sq('clap'), sq('rim'))]);
  const frame = inPrep(page, 'g').locator(':scope > .frame');
  await drag(page, frame, await at(inPattern(page, 'snare'), 0.9));
  await expect.poll(() => sounds(pattern(page))).toBe('Kick Snare [Clap Rim]');
  await expect.poll(() => shape(prep(page))).toBe('g[clap rim]');
  const copied = await shape(pattern(page));
  expect(copied).not.toContain('clap');
  expect(copied).not.toMatch(/\bg\[/);
  // Dropped a second time: another copy.
  await drag(page, frame, await at(inPattern(page, 'kick'), 0.1));
  await expect.poll(() => sounds(pattern(page))).toBe('[Clap Rim] Kick Snare [Clap Rim]');
});

test('drag prep → pattern with Alt held at release moves', async ({ page, isMobile }) => {
  test.skip(isMobile, 'no Alt key on touch');
  await load(page, [sq('kick'), sq('snare')], [sq('clap'), sq('rim')]);
  await drag(page, inPrep(page, 'clap'), await at(inPattern(page, 'snare'), 0.9), async () => {
    await expect(page.locator('.ghost')).toContainText('Copy');
    // Pressing Alt without moving updates the label at once (review finding).
    await page.keyboard.down('Alt');
    await expect(page.locator('.ghost')).not.toContainText('Copy');
    await page.keyboard.up('Alt');
    await expect(page.locator('.ghost')).toContainText('Copy');
    await page.keyboard.down('Alt');
  });
  await page.keyboard.up('Alt');
  await expect.poll(() => shape(pattern(page))).toBe('kick snare clap');
  await expect.poll(() => shape(prep(page))).toBe('rim');
});

test('the ghost says Copy while a drop from the prep area would copy', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag');
  await load(page, [sq('kick')], [sq('clap')]);
  await drag(page, inPrep(page, 'clap'), await at(inPattern(page, 'kick'), 0.9), async () => {
    await expect(page.locator('.ghost')).toContainText('Copy');
  });
});

test('drag pattern → prep moves', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag');
  await load(page, [sq('kick'), sq('snare'), sq('clap')], [sq('rim')]);
  await drag(page, inPattern(page, 'snare'), await at(inPrep(page, 'rim'), 0.9));
  await expect.poll(() => shape(pattern(page))).toBe('kick clap');
  await expect.poll(() => shape(prep(page))).toBe('rim snare');
});

test('drag pattern → an empty prep area moves', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag');
  await load(page, [sq('kick'), sq('snare')]);
  await drag(page, inPattern(page, 'kick'), await at(prep(page), 0.5));
  await expect.poll(() => shape(pattern(page))).toBe('snare');
  await expect.poll(() => shape(prep(page))).toBe('kick');
});

test('a prep square dropped onto the middle of a pattern square combines with it (a copy)', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'mouse drag');
  await load(page, [sq('kick'), sq('snare'), sq('hat')], [sq('clap')]);
  await drag(page, inPrep(page, 'clap'), await at(inPattern(page, 'snare'), 0.5), async () => {
    await expect(page.locator('.drop-combine')).toBeVisible();
  });
  await expect.poll(() => sounds(pattern(page))).toBe('Kick [Snare Clap] Hat');
  await expect.poll(() => shape(prep(page))).toBe('clap');
});

test('dropping outside both areas deletes from the prep area', async ({ page, isMobile }) => {
  test.skip(isMobile, 'mouse drag');
  await load(page, [sq('kick')], [sq('clap'), sq('rim')]);
  const box = await prep(page).boundingBox();
  if (!box) throw new Error('no prep area');
  await drag(page, inPrep(page, 'clap'), { x: box.x + 30, y: box.y + box.height + 120 });
  await expect.poll(() => shape(prep(page))).toBe('rim');
  await expect.poll(() => shape(pattern(page))).toBe('kick');
});

test('Group, Mute and Delete work on a prep selection; a mixed selection cannot be grouped', async ({
  page,
  isMobile,
}) => {
  await load(page, [sq('kick')], [sq('clap'), sq('rim'), sq('hat')]);
  const pick = async (target: Locator, first: boolean) => {
    if (isMobile) await target.tap();
    else await target.click(first ? {} : { modifiers: ['Shift'] });
  };
  await pick(inPrep(page, 'clap'), true);
  await pick(inPrep(page, 'rim'), false);
  await barButton(page, 'Group').click();
  await expect.poll(() => sounds(prep(page))).toBe('[Clap Rim] Hat');
  await barButton(page, 'Mute').click();
  await expect(inPrep(page, 'clap')).toHaveAttribute('aria-label', 'Clap, muted');

  await pick(inPrep(page, 'hat'), true);
  if (isMobile) await expect(page.getByRole('toolbar', { name: 'Selection' })).toContainText('2 selected');
  await pick(inPattern(page, 'kick'), false);
  await expect(barButton(page, 'Group')).toBeDisabled();
  await barButton(page, 'Delete').click();
  await expect.poll(() => shape(pattern(page))).toBe('');
  if (!isMobile) await expect.poll(() => shape(prep(page))).toMatch(/^\w+\[clap rim\]$/);
});

test('08 guard: a drop 120 px below the pattern deletes and does not land in the prep area', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'mouse drag');
  await load(page, [sq('kick'), sq('snare'), sq('clap')]);
  const box = await pattern(page).boundingBox();
  if (!box) throw new Error('no pattern');
  await drag(page, inPattern(page, 'snare'), { x: box.x + 30, y: box.y + box.height + 120 });
  await expect.poll(() => shape(pattern(page))).toBe('kick clap');
  await expect(prep(page).locator('[data-node-id]')).toHaveCount(0);
});

test('after a prep → pattern drop, the next click selects, and the active area is unchanged', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'mouse drag');
  await load(page, [sq('kick'), sq('snare')], [sq('clap')]);
  await expect(pattern(page)).toHaveClass(/active/);
  await drag(page, inPrep(page, 'clap'), await at(inPattern(page, 'snare'), 0.9));
  await expect.poll(() => sounds(pattern(page))).toBe('Kick Snare Clap');
  await expect(pattern(page)).toHaveClass(/active/);
  await expect(prep(page)).not.toHaveClass(/active/);
  await inPattern(page, 'kick').click();
  await expect(inPattern(page, 'kick')).toHaveAttribute('aria-pressed', 'true');
});

test('Escape during a prep → pattern drag changes nothing, released over the pattern', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'mouse drag');
  await load(page, [sq('kick'), sq('snare')], [sq('clap')]);
  await inPattern(page, 'kick').click();
  await drag(page, inPrep(page, 'clap'), await at(inPattern(page, 'snare'), 0.9), () =>
    page.keyboard.press('Escape'),
  );
  await expect.poll(() => shape(pattern(page))).toBe('kick snare');
  await expect.poll(() => shape(prep(page))).toBe('clap');
  // Picking up clap selected it; Escape keeps that selection and the release does not change it.
  await expect(inPrep(page, 'clap')).toHaveAttribute('aria-pressed', 'true');
});

test('keyboard: the empty prep area can be focused and made active with Enter', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'keyboard');
  await load(page, [sq('kick')]);
  await prep(page).focus();
  await page.keyboard.press('Enter');
  await expect(prep(page)).toHaveClass(/active/);
  await expect(prep(page)).toHaveAttribute('aria-current', 'true');
  await paletteButton(page, 'Rim').click();
  await expect.poll(() => sounds(prep(page))).toBe('Rim');
});

test('the prep area never plays; a copy from it while playing is heard on the next loop', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'mouse drag; touch is covered below');
  await load(page, [sq('kick'), sq('snare'), sq('clap'), sq('hat')], [sq('rim'), sq('tone-high')]);
  await page.evaluate(() => window.__seqTest!.app.setBpm(300));
  await page.getByRole('button', { name: 'Play' }).click();
  await expect
    .poll(() => page.evaluate(() => window.__seqTest!.engine.log.length), { timeout: 5000 })
    .toBeGreaterThanOrEqual(8);
  const before = await page.evaluate(() => window.__seqTest!.engine.log.map((e) => e.soundId));
  expect(before).not.toContain('rim');
  expect(before).not.toContain('tone-high');

  await drag(page, inPrep(page, 'rim'), await at(inPattern(page, 'kick'), 0.1));
  await expect.poll(() => sounds(pattern(page))).toBe('Rim Kick Snare Clap Hat');
  const since = await page.evaluate(() => window.__seqTest!.engine.log.length);
  await expect
    .poll(() => page.evaluate((n) => window.__seqTest!.engine.log.length - n, since), { timeout: 5000 })
    .toBeGreaterThanOrEqual(15);
  const heard = await page.evaluate(
    (n) => window.__seqTest!.engine.log.slice(n).map((e) => e.soundId),
    since,
  );
  const start = heard.indexOf('rim');
  expect(start).toBeGreaterThanOrEqual(0);
  expect(heard.slice(start, start + 10)).toEqual([
    'rim',
    'kick',
    'snare',
    'clap',
    'hat',
    'rim',
    'kick',
    'snare',
    'clap',
    'hat',
  ]);
  expect(heard).not.toContain('tone-high');
});

test('reload: the prep area is empty and the pattern is restored', async ({ page }) => {
  await page.goto('./?fake-audio');
  await expect(pattern(page).locator(':scope > [data-node-id]')).toHaveCount(8);
  await paletteButton(page, 'Clap').click();
  await prep(page).click();
  await paletteButton(page, 'Rim').click();
  await expect(prep(page).locator('[data-node-id]')).toHaveCount(1);
  await expect
    .poll(async () => JSON.stringify(await storedSong(page)), { timeout: 5000 })
    .toContain('"clap"');
  expect(JSON.stringify(await storedSong(page))).not.toContain('"rim"');
  await page.reload();
  await expect(pattern(page).locator(':scope > [data-node-id]')).toHaveCount(9);
  await expect(prep(page).locator('[data-node-id]')).toHaveCount(0);
});

test('touch: long-press a prep square and drag it into the pattern copies it', async ({
  page,
  browserName,
  isMobile,
}) => {
  test.skip(!isMobile || browserName !== 'chromium', 'CDP touch events need Chromium');
  await load(page, [sq('kick'), sq('snare')], [sq('clap')]);
  const cdp = await page.context().newCDPSession(page);
  const from = await at(inPrep(page, 'clap'), 0.5);
  const to = await at(inPattern(page, 'kick'), 0.9);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await touch('touchStart', from);
  await page.waitForTimeout(450);
  for (let i = 1; i <= 10; i++) {
    await touch('touchMove', {
      x: from.x + ((to.x - from.x) * i) / 10,
      y: from.y + ((to.y - from.y) * i) / 10,
    });
  }
  await touch('touchEnd');
  await expect.poll(() => sounds(pattern(page))).toBe('Kick Clap Snare');
  await expect.poll(() => shape(prep(page))).toBe('clap');
});
