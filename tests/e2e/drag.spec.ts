import { expect, test, type Locator, type Page } from '@playwright/test';

type Node =
  | { kind: 'square'; id: string; soundId: string | null; muted: boolean }
  | { kind: 'group'; id: string; span: 1; children: Node[] };

const sq = (id: string): Node => ({ kind: 'square', id, soundId: id, muted: false });
const grp = (id: string, ...children: Node[]): Node => ({ kind: 'group', id, span: 1, children });

const strip = (page: Page) => page.getByRole('region', { name: 'Pattern' });
const node = (page: Page, id: string) => strip(page).locator(`[data-node-id="${id}"]`);

/** Opens the app with fake audio and replaces the pattern; ids double as kit sound ids. */
async function load(page: Page, nodes: Node[]) {
  await page.goto('./?fake-audio');
  await page.waitForFunction(() => window.__seqTest !== undefined);
  await page.evaluate((nodes) => {
    const app = window.__seqTest!.app;
    app.song = { ...app.song, tracks: [{ id: 't', nodes: nodes as never }] };
    app.clearSelection();
  }, nodes);
}

/** The rendered pattern as a compact string, e.g. `kick g[snare clap] rim`. */
function shape(page: Page): Promise<string> {
  return strip(page).evaluate((el) => {
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

/** Point inside an element at fractions of its box. */
async function at(target: Locator, fx: number, fy = 0.5) {
  const box = await target.boundingBox();
  if (!box) throw new Error('element not visible');
  return { x: box.x + box.width * fx, y: box.y + box.height * fy };
}

/** Mouse drag in small steps (pointer events), from the center of `from` to `to`. */
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
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await beforeRelease?.();
  await page.mouse.up();
}

test('drags a square to a new position', async ({ page }) => {
  await load(page, [sq('kick'), sq('snare'), sq('clap'), sq('rim')]);
  await drag(page, node(page, 'kick'), await at(node(page, 'clap'), 0.8));
  await expect.poll(() => shape(page)).toBe('snare clap kick rim');
});

test('drags three selected squares after the last one', async ({ page }) => {
  await load(page, [sq('kick'), sq('snare'), sq('clap'), sq('rim')]);
  await node(page, 'kick').click();
  await node(page, 'snare').click({ modifiers: ['Shift'] });
  await node(page, 'clap').click({ modifiers: ['Shift'] });
  await drag(page, node(page, 'snare'), await at(node(page, 'rim'), 0.8));
  await expect.poll(() => shape(page)).toBe('rim kick snare clap');
});

test('drags a square into a group', async ({ page }) => {
  await load(page, [sq('kick'), grp('g', sq('snare'), sq('clap')), sq('rim')]);
  await drag(page, node(page, 'rim'), await at(node(page, 'clap'), 0.25));
  await expect.poll(() => shape(page)).toBe('kick g[snare rim clap]');
});

test('drags a square out of a two-child group, which dissolves', async ({ page }) => {
  await load(page, [sq('kick'), grp('g', sq('snare'), sq('clap')), sq('rim')]);
  await drag(page, node(page, 'snare'), await at(node(page, 'rim'), 0.8));
  await expect.poll(() => shape(page)).toBe('kick clap rim snare');
});

test('drags a whole group as a block', async ({ page }) => {
  await load(page, [sq('kick'), grp('g', sq('snare'), sq('clap')), sq('rim')]);
  // The group frame is its padding: grab it at the top edge.
  const frame = node(page, 'g').locator(':scope > .frame');
  const box = await frame.boundingBox();
  if (!box) throw new Error('no frame');
  await page.mouse.move(box.x + box.width / 2, box.y + 2);
  await page.mouse.down();
  const to = await at(node(page, 'rim'), 0.8);
  await page.mouse.move(to.x, to.y, { steps: 8 });
  await page.mouse.up();
  await expect.poll(() => shape(page)).toBe('kick rim g[snare clap]');
});

test('dropping far outside the strip deletes', async ({ page }) => {
  await load(page, [sq('kick'), sq('snare'), sq('clap')]);
  const box = await strip(page).boundingBox();
  if (!box) throw new Error('no strip');
  await drag(page, node(page, 'snare'), { x: box.x + 30, y: box.y + box.height + 120 });
  await expect.poll(() => shape(page)).toBe('kick clap');
});

test('Escape aborts a drag', async ({ page }) => {
  await load(page, [sq('kick'), sq('snare'), sq('clap')]);
  await drag(page, node(page, 'kick'), await at(node(page, 'clap'), 0.8), () =>
    page.keyboard.press('Escape'),
  );
  await expect.poll(() => shape(page)).toBe('kick snare clap');
});

test('shows an insertion line while dragging and removes it after', async ({ page }) => {
  await load(page, [sq('kick'), sq('snare'), sq('clap')]);
  await drag(page, node(page, 'kick'), await at(node(page, 'clap'), 0.8), async () => {
    await expect(page.locator('.drop-indicator')).toBeVisible();
    await expect(node(page, 'kick')).toHaveClass(/dragging/);
  });
  await expect(page.locator('.drop-indicator')).toHaveCount(0);
});

test('dragging an unselected square selects only it, and the drop click does not toggle it', async ({
  page,
}) => {
  await load(page, [sq('kick'), sq('snare'), sq('clap')]);
  await node(page, 'clap').click();
  await drag(page, node(page, 'kick'), await at(node(page, 'kick'), 0.9));
  await expect(node(page, 'kick')).toHaveAttribute('aria-pressed', 'true');
  await expect(node(page, 'clap')).toHaveAttribute('aria-pressed', 'false');
});

test('a reorder while playing is heard on the next loop', async ({ page }) => {
  await load(page, [sq('kick'), sq('snare'), sq('clap'), sq('rim')]);
  await page.evaluate(() => window.__seqTest!.app.setBpm(300));
  await page.getByRole('button', { name: 'Play' }).click();
  await drag(page, node(page, 'rim'), await at(node(page, 'kick'), 0.2));
  await expect.poll(() => shape(page)).toBe('rim kick snare clap');
  const since = await page.evaluate(() => window.__seqTest!.engine.log.length);
  await expect
    .poll(() => page.evaluate((n) => window.__seqTest!.engine.log.length - n, since), { timeout: 5000 })
    .toBeGreaterThanOrEqual(12);
  const heard = await page.evaluate(
    (n) => window.__seqTest!.engine.log.slice(n).map((e) => e.soundId),
    since,
  );
  // Skip what was already scheduled before the drop (lookahead), then expect the new order, looping.
  const start = heard.indexOf('rim', 4);
  expect(heard.slice(start, start + 8)).toEqual([
    'rim',
    'kick',
    'snare',
    'clap',
    'rim',
    'kick',
    'snare',
    'clap',
  ]);
});

test('touch: long-press picks a square up and moves it', async ({ page, browserName, isMobile }) => {
  test.skip(!isMobile || browserName !== 'chromium', 'CDP touch events need Chromium');
  await load(page, [sq('kick'), sq('snare'), sq('clap'), sq('rim')]);
  const cdp = await page.context().newCDPSession(page);
  const from = await at(node(page, 'kick'), 0.5);
  const to = await at(node(page, 'clap'), 0.8);
  const touch = (type: 'touchStart' | 'touchMove' | 'touchEnd', p?: { x: number; y: number }) =>
    cdp.send('Input.dispatchTouchEvent', { type, touchPoints: p ? [{ x: p.x, y: p.y }] : [] });
  await touch('touchStart', from);
  await page.waitForTimeout(450);
  for (let i = 1; i <= 8; i++) {
    await touch('touchMove', {
      x: from.x + ((to.x - from.x) * i) / 8,
      y: from.y + ((to.y - from.y) * i) / 8,
    });
  }
  await touch('touchEnd');
  await expect.poll(() => shape(page)).toBe('snare clap kick rim');
});
