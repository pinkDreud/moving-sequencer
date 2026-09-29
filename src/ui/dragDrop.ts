// Glue between the DOM, the pure drop hit-testing and the ops, for drag & drop in the Strip.
import type { Drop, LayoutItem } from '../core/dropTarget';
import type { NodeId } from '../core/model';
import { move, remove } from '../core/ops';
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

/** Dragging a selected node drags the whole selection; an unselected one is dragged alone. */
export function dragIds(selection: ReadonlySet<NodeId>, pressed: NodeId): NodeId[] {
  return selection.has(pressed) ? [...selection] : [pressed];
}

/** Applies a drop: move the dragged nodes, or delete them. */
export function applyDrop(app: AppState, ids: readonly NodeId[], drop: Drop): void {
  if (drop.kind === 'delete') app.updateTrack((t) => remove(t, ids));
  else app.updateTrack((t) => move(t, ids, drop.target));
}
