import { describe, expect, it } from 'vitest';
import { dropTarget, dropTargetIn, type AreaItem, type AreaRect, type Rect } from './dropTarget';

const rect = (left: number, top: number, width: number, height: number): Rect => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
});

/** Pattern strip at y 0..100 with squares A B; prep strip at y 300..400 with squares P Q. */
const areas: AreaRect[] = [
  { area: 'pattern', rect: rect(0, 0, 600, 100) },
  { area: 'prep', rect: rect(0, 300, 600, 100) },
];
const square = (area: AreaItem['area'], id: string, index: number, top: number): AreaItem => ({
  area,
  id,
  parentId: null,
  index,
  kind: 'square',
  depth: 0,
  rect: rect(10 + index * 60, top, 50, 50),
});
const items: AreaItem[] = [
  square('pattern', 'A', 0, 10),
  square('pattern', 'B', 1, 10),
  square('prep', 'P', 0, 310),
  square('prep', 'Q', 1, 310),
];

describe('dropTargetIn', () => {
  it('inside the pattern: the same drop as dropTarget on the pattern items, tagged with the area', () => {
    const p = { x: 22, y: 30 };
    const patternItems = items.filter((i) => i.area === 'pattern');
    expect(dropTargetIn(p, items, areas)).toEqual({
      ...dropTarget(p, patternItems, rect(0, 0, 600, 100)),
      area: 'pattern',
    });
  });

  it('inside the prep area: hit-tests the prep items only', () => {
    expect(dropTargetIn({ x: 22, y: 330 }, items, areas)).toMatchObject({
      area: 'prep',
      kind: 'move',
      target: { parentId: null, index: 0 },
    });
    expect(dropTargetIn({ x: 35, y: 330 }, items, areas)).toMatchObject({
      area: 'prep',
      kind: 'combine',
      targetId: 'P',
    });
  });

  it('between the strips, the nearer one within the margin takes the drop', () => {
    expect(dropTargetIn({ x: 100, y: 130 }, items, areas)).toMatchObject({ area: 'pattern', kind: 'move' });
    expect(dropTargetIn({ x: 100, y: 270 }, items, areas)).toMatchObject({ area: 'prep', kind: 'move' });
  });

  it('further than the margin from both strips means delete', () => {
    expect(dropTargetIn({ x: 100, y: 200 }, items, areas)).toEqual({ kind: 'delete' });
    expect(dropTargetIn({ x: 100, y: 460 }, items, areas)).toEqual({ kind: 'delete' });
    expect(dropTargetIn({ x: 100, y: 200 }, items, areas, { deleteMargin: 120 })).toMatchObject({
      area: 'pattern',
    });
  });

  it('an empty prep area takes a drop at its start', () => {
    const patternOnly = items.filter((i) => i.area === 'pattern');
    expect(dropTargetIn({ x: 300, y: 350 }, patternOnly, areas)).toMatchObject({
      area: 'prep',
      kind: 'move',
      target: { parentId: null, index: 0 },
    });
  });

  it('with a single area it behaves like dropTarget', () => {
    const one = [areas[0] as AreaRect];
    expect(dropTargetIn({ x: 100, y: 200 }, items, one)).toEqual({ kind: 'delete' });
    expect(dropTargetIn({ x: 100, y: 120 }, items, one)).toMatchObject({ area: 'pattern', kind: 'move' });
  });
});
