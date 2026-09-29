// Glue between the DOM, the pure drop hit-testing and the ops, for drag & drop in the Strip.
import type { Drop, LayoutItem } from '../core/dropTarget';
import type { IdGen, NodeId, Track } from '../core/model';
import { combine, findLocation, move, remove } from '../core/ops';
import type { AppState } from '../state.svelte';

/**
 * Snapshot of the rendered nodes under `strip` (the Strip DOM contract: every node has `data-node-id`, a group is
 * `.group` and its children sit in a descendant container). Rects are viewport coordinates.
 */
export function readLayout(strip: HTMLElement): LayoutItem[] {
  const nodes = [...strip.querySelectorAll<HTMLElement>('[data-node-id]')];
  return nodes.map((el) => {
    const parentEl = el.parentElement?.closest<HTMLElement>('[data-node-id]');
    const parent = parentEl && strip.contains(parentEl) ? parentEl : null;
    const siblings = [...(el.parentElement?.children ?? [])].filter(
      (c) => c instanceof HTMLElement && c.dataset.nodeId !== undefined,
    );
    let depth = 0;
    for (let p = parent; p; p = p.parentElement?.closest<HTMLElement>('[data-node-id]') ?? null) depth++;
    const { left, top, right, bottom } = el.getBoundingClientRect();
    return {
      id: el.dataset.nodeId ?? '',
      parentId: parent?.dataset.nodeId ?? null,
      index: siblings.indexOf(el),
      kind: el.classList.contains('group') ? 'group' : 'square',
      depth,
      rect: { left, top, right, bottom },
    };
  });
}

/**
 * Dragging a selected node, or a node inside a selected group, drags the whole selection (a group's frame is too
 * thin to grab on touch). Anything else is dragged alone.
 */
export function dragIds(track: Track, selection: ReadonlySet<NodeId>, pressed: NodeId): NodeId[] {
  for (let id: NodeId | null = pressed; id !== null; id = findLocation(track, id)?.parentId ?? null) {
    if (selection.has(id)) return [...selection];
  }
  return [pressed];
}

/** The track after a drop; the same track when the drop changes nothing. `nextId` names a group it creates. */
export function dropResult(
  track: Track,
  ids: readonly NodeId[],
  drop: Drop,
  nextId: IdGen = () => '__probe__',
): Track {
  if (drop.kind === 'delete') return remove(track, ids);
  if (drop.kind === 'combine') return combine(track, ids, drop.targetId, nextId);
  return move(track, ids, drop.target);
}

/** Applies a drop: move, combine into a group, or delete. */
export function applyDrop(app: AppState, ids: readonly NodeId[], drop: Drop): void {
  app.updateTrack((t) => dropResult(t, ids, drop, app.nextId));
}
