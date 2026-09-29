import { describe, expect, it } from 'vitest';
import { dropTarget, type LayoutItem, type Rect } from './dropTarget';

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

/** Top-level squares of 50x50 with 10px gaps, `perRow` per row, rows 60px apart, strip at (0,0). */
function row(ids: string[], perRow = 10): LayoutItem[] {
  return ids.map((id, i) => ({
    id,
    parentId: null,
    index: i,
    kind: 'square',
    depth: 0,
    rect: rect((i % perRow) * 60, Math.floor(i / perRow) * 60, 50, 50),
  }));
}

const strip = rect(0, 0, 600, 200);

describe('dropTarget over squares', () => {
  const items = row(['A', 'B', 'C']);

  it('left half of a square drops before it', () => {
    expect(dropTarget({ x: 70, y: 25 }, items, strip)).toMatchObject({
      kind: 'move',
      target: { parentId: null, index: 1 },
      indicator: { x: 60, top: 0, bottom: 50 },
    });
  });

  it('right half of a square drops after it', () => {
    expect(dropTarget({ x: 100, y: 25 }, items, strip)).toMatchObject({
      kind: 'move',
      target: { parentId: null, index: 2 },
      indicator: { x: 110 },
    });
  });
});

describe('dropTarget over groups', () => {
  // A, G[B C D], E — the group occupies slot 1 (60..110), children 50/3 px wide each, inset by 0.
  const items: LayoutItem[] = [
    { id: 'A', parentId: null, index: 0, kind: 'square', depth: 0, rect: rect(0, 0, 50, 50) },
    { id: 'G', parentId: null, index: 1, kind: 'group', depth: 0, rect: rect(60, 0, 50, 50) },
    { id: 'B', parentId: 'G', index: 0, kind: 'square', depth: 1, rect: rect(62, 2, 15, 46) },
    { id: 'C', parentId: 'G', index: 1, kind: 'square', depth: 1, rect: rect(77, 2, 16, 46) },
    { id: 'D', parentId: 'G', index: 2, kind: 'square', depth: 1, rect: rect(93, 2, 15, 46) },
    { id: 'E', parentId: null, index: 2, kind: 'square', depth: 0, rect: rect(120, 0, 50, 50) },
  ];

  it('the left edge of a group drops before the group', () => {
    expect(dropTarget({ x: 61, y: 25 }, items, strip)).toMatchObject({
      target: { parentId: null, index: 1 },
    });
  });

  it('the right edge of a group drops after the group', () => {
    expect(dropTarget({ x: 109, y: 25 }, items, strip)).toMatchObject({
      target: { parentId: null, index: 2 },
    });
  });

  it('over a child in the inner area, the child decides (innermost wins)', () => {
    // C spans 77..93, center 85: left half → before C (index 1), right half → after C (index 2).
    expect(dropTarget({ x: 80, y: 25 }, items, strip)).toMatchObject({ target: { parentId: 'G', index: 1 } });
    expect(dropTarget({ x: 90, y: 25 }, items, strip)).toMatchObject({ target: { parentId: 'G', index: 2 } });
  });

  it('the inner group area outside any child drops inside at the index by child centers', () => {
    // y = 1 is inside G (top 0) but above the children (top 2).
    expect(dropTarget({ x: 88, y: 1 }, items, strip)).toMatchObject({
      target: { parentId: 'G', index: 2 },
      indicator: { x: 93 },
    });
  });

  it('inside a group past the last child, the indicator sits at the last child right edge', () => {
    const wide = items.map((it) => (it.id === 'G' ? { ...it, rect: rect(60, 0, 80, 50) } : it));
    expect(dropTarget({ x: 120, y: 1 }, wide, strip)).toMatchObject({
      target: { parentId: 'G', index: 3 },
      indicator: { x: 108 },
    });
  });

  it('nested groups: the innermost element under the pointer wins', () => {
    const nested: LayoutItem[] = [
      { id: 'G', parentId: null, index: 0, kind: 'group', depth: 0, rect: rect(0, 0, 100, 50) },
      { id: 'X', parentId: 'G', index: 0, kind: 'square', depth: 1, rect: rect(0, 0, 50, 50) },
      { id: 'H', parentId: 'G', index: 1, kind: 'group', depth: 1, rect: rect(50, 0, 50, 50) },
      { id: 'Y', parentId: 'H', index: 0, kind: 'square', depth: 2, rect: rect(50, 0, 25, 50) },
      { id: 'Z', parentId: 'H', index: 1, kind: 'square', depth: 2, rect: rect(75, 0, 25, 50) },
    ];
    expect(dropTarget({ x: 80, y: 25 }, nested, strip)).toMatchObject({
      target: { parentId: 'H', index: 1 },
    });
  });
});

describe('dropTarget in gaps and empty space', () => {
  const items = row(['A', 'B', 'C', 'D', 'E'], 3); // row 0: A B C, row 1: D E

  it('in the gap between two squares uses the nearest one', () => {
    // gap between A (0..50) and B (60..110): x = 53 is nearer A → after A.
    expect(dropTarget({ x: 53, y: 25 }, items, strip)).toMatchObject({
      target: { parentId: null, index: 1 },
    });
    expect(dropTarget({ x: 58, y: 25 }, items, strip)).toMatchObject({
      target: { parentId: null, index: 1 },
    });
  });

  it('past the end of a row drops after its last item', () => {
    expect(dropTarget({ x: 400, y: 80 }, items, strip)).toMatchObject({
      target: { parentId: null, index: 5 },
      indicator: { x: 110, top: 60, bottom: 110 },
    });
    // End of the first row: after C, which is index 3 (before D).
    expect(dropTarget({ x: 400, y: 25 }, items, strip)).toMatchObject({
      target: { parentId: null, index: 3 },
    });
  });

  it('between rows uses the nearest row', () => {
    expect(dropTarget({ x: 5, y: 56 }, items, strip)).toMatchObject({ target: { parentId: null, index: 3 } });
    expect(dropTarget({ x: 5, y: 150 }, items, strip)).toMatchObject({
      target: { parentId: null, index: 3 },
    });
  });

  it('an empty track drops at the root start', () => {
    expect(dropTarget({ x: 300, y: 100 }, [], strip)).toMatchObject({
      kind: 'move',
      target: { parentId: null, index: 0 },
    });
  });
});

describe('dropTarget delete zone', () => {
  const items = row(['A']);

  it('far outside the strip means delete', () => {
    expect(dropTarget({ x: 300, y: 260 }, items, strip)).toEqual({ kind: 'delete' });
    expect(dropTarget({ x: -41, y: 25 }, items, strip)).toEqual({ kind: 'delete' });
  });

  it('just outside the strip (within the margin) still moves', () => {
    expect(dropTarget({ x: 300, y: 230 }, items, strip).kind).toBe('move');
  });

  it('the margin is configurable', () => {
    expect(dropTarget({ x: 300, y: 215 }, items, strip, { deleteMargin: 10 })).toEqual({ kind: 'delete' });
  });
});

describe('dropTarget with clipped group children', () => {
  // G (0..50) clips its children; the last child overflows to 50..62, over the next slot N (60..110).
  const items: LayoutItem[] = [
    { id: 'G', parentId: null, index: 0, kind: 'group', depth: 0, rect: rect(0, 0, 50, 50) },
    { id: 'a', parentId: 'G', index: 0, kind: 'square', depth: 1, rect: rect(2, 2, 25, 46) },
    { id: 'b', parentId: 'G', index: 1, kind: 'square', depth: 1, rect: rect(27, 2, 35, 46) },
    { id: 'N', parentId: null, index: 1, kind: 'square', depth: 0, rect: rect(60, 0, 50, 50) },
  ];

  it('a child only counts where it is visible inside its parent', () => {
    expect(dropTarget({ x: 61, y: 25 }, items, strip)).toMatchObject({
      target: { parentId: null, index: 1 },
    });
  });

  it('still counts where it is visible', () => {
    expect(dropTarget({ x: 40, y: 25 }, items, strip)).toMatchObject({ target: { parentId: 'G', index: 1 } });
  });
});
