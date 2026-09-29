import type { NodeId } from './model';
import type { DropTarget } from './ops';

export interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

export interface Point {
  x: number;
  y: number;
}

/** Snapshot of one rendered node. `index` is its position in its parent, `depth` 0 = top level. */
export interface LayoutItem {
  id: NodeId;
  parentId: NodeId | null;
  index: number;
  kind: 'square' | 'group';
  depth: number;
  rect: Rect;
}

/** Where to draw the insertion line. */
export interface Indicator {
  x: number;
  top: number;
  bottom: number;
}

export type Drop =
  | { kind: 'move'; target: DropTarget; indicator: Indicator }
  /** Onto the middle of a top-level square: group the dragged nodes with it. */
  | { kind: 'combine'; targetId: NodeId; rect: Rect }
  | { kind: 'delete' };

export interface DropOptions {
  /** Distance outside the strip (px) beyond which a drop deletes. */
  deleteMargin?: number;
  /** Fraction of a group's width on each side that means "before/after the group" rather than "inside". */
  groupEdge?: number;
  /** Fraction of a top-level square's width, centred, that means "combine with it" rather than before/after. */
  combineZone?: number;
}

const contains = (r: Rect, p: Point) => p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
const centerX = (r: Rect) => (r.left + r.right) / 2;
const distance = (value: number, from: number, to: number) => Math.max(from - value, 0, value - to);

function beside(item: LayoutItem, after: boolean): Drop {
  const { rect } = item;
  return {
    kind: 'move',
    target: { parentId: item.parentId, index: item.index + (after ? 1 : 0) },
    indicator: { x: after ? rect.right : rect.left, top: rect.top, bottom: rect.bottom },
  };
}

function insideGroup(group: LayoutItem, items: readonly LayoutItem[], p: Point): Drop {
  const children = items.filter((i) => i.parentId === group.id).sort((a, b) => a.index - b.index);
  const index = children.filter((c) => centerX(c.rect) < p.x).length;
  const next = children[index];
  const last = children[children.length - 1];
  const x = next ? next.rect.left : last ? last.rect.right : centerX(group.rect);
  return {
    kind: 'move',
    target: { parentId: group.id, index },
    indicator: { x, top: group.rect.top, bottom: group.rect.bottom },
  };
}

/** Nearest top-level row (items sharing a vertical band), then the horizontally nearest item in it. */
function nearestTopLevel(items: readonly LayoutItem[], p: Point): LayoutItem | undefined {
  const top = items.filter((i) => i.parentId === null);
  const rowDistance = (i: LayoutItem) => distance(p.y, i.rect.top, i.rect.bottom);
  const best = Math.min(...top.map(rowDistance));
  const row = top.filter((i) => rowDistance(i) === best);
  return row.reduce<LayoutItem | undefined>((a, b) => {
    if (!a) return b;
    return distance(p.x, b.rect.left, b.rect.right) < distance(p.x, a.rect.left, a.rect.right) ? b : a;
  }, undefined);
}

/** Where a drop at `p` lands, given a snapshot of the rendered layout and the strip's rect. */
export function dropTarget(
  p: Point,
  items: readonly LayoutItem[],
  strip: Rect,
  { deleteMargin = 40, groupEdge = 0.2, combineZone = 0.5 }: DropOptions = {},
): Drop {
  const outside = Math.max(distance(p.x, strip.left, strip.right), distance(p.y, strip.top, strip.bottom));
  if (outside > deleteMargin) return { kind: 'delete' };

  // Innermost element under the pointer decides. Groups clip their children, so a child only counts where it is
  // visible: the pointer must be inside every ancestor too.
  const byId = new Map(items.map((i) => [i.id, i]));
  const visibleAt = (item: LayoutItem): boolean => {
    for (let a = item.parentId === null ? undefined : byId.get(item.parentId); a;) {
      if (!contains(a.rect, p)) return false;
      a = a.parentId === null ? undefined : byId.get(a.parentId);
    }
    return true;
  };
  const hit = items.filter((i) => contains(i.rect, p) && visibleAt(i)).sort((a, b) => b.depth - a.depth)[0];
  if (hit?.kind === 'square') {
    // Only top-level squares: inside groups squares are too narrow for three zones, and nesting stays explicit.
    const half = ((hit.rect.right - hit.rect.left) * combineZone) / 2;
    if (hit.depth === 0 && Math.abs(p.x - centerX(hit.rect)) <= half) {
      return { kind: 'combine', targetId: hit.id, rect: hit.rect };
    }
    return beside(hit, p.x >= centerX(hit.rect));
  }
  if (hit?.kind === 'group') {
    const edge = (hit.rect.right - hit.rect.left) * groupEdge;
    if (p.x < hit.rect.left + edge) return beside(hit, false);
    if (p.x > hit.rect.right - edge) return beside(hit, true);
    return insideGroup(hit, items, p);
  }

  const nearest = nearestTopLevel(items, p);
  if (nearest) return beside(nearest, p.x >= centerX(nearest.rect));
  return {
    kind: 'move',
    target: { parentId: null, index: 0 },
    indicator: { x: strip.left, top: strip.top, bottom: strip.bottom },
  };
}
