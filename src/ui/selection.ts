// Pure selection helpers used by the strip, the palette and the selection bar.
import type { NodeId, SeqNode, Square, Track } from '../core/model';
import { findLocation, findNode, groupOrJoin, nodeIds, ungroup } from '../core/ops';

export type SelectMode = 'replace' | 'toggle' | 'range';

export interface PointerLike {
  pointerType: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/**
 * A plain mouse/keyboard click replaces the selection; Shift selects a range; Ctrl/Cmd, or a touch/pen tap (no
 * modifier keys there), toggles.
 */
export function selectMode(e: PointerLike): SelectMode {
  if (e.pointerType === 'touch' || e.pointerType === 'pen') return 'toggle';
  if (e.shiftKey) return 'range';
  return e.metaKey || e.ctrlKey ? 'toggle' : 'replace';
}

/**
 * What Shift+click selects, from `anchor` (the last plain or Ctrl/Cmd click) to `target`. Siblings: the nodes
 * between them (a group stays one block). Different levels: every square between them, in time order.
 */
export function rangeIds(track: Track, anchor: NodeId, target: NodeId): NodeId[] {
  const from = findLocation(track, anchor);
  const to = findLocation(track, target);
  if (!from || !to) return [target];
  if (from.parentId === to.parentId) {
    const parent = from.parentId === null ? undefined : findNode(track, from.parentId);
    const siblings = parent?.kind === 'group' ? parent.children : track.nodes;
    const [lo, hi] = from.index < to.index ? [from.index, to.index] : [to.index, from.index];
    return siblings.slice(lo, hi + 1).map((n) => n.id);
  }
  const squares = nodeIds(track).filter((id) => findNode(track, id)?.kind === 'square');
  const span = [anchor, target].flatMap((id) => {
    const node = findNode(track, id);
    return node ? squaresIn(node).map((s) => squares.indexOf(s.id)) : [];
  });
  return squares.slice(Math.min(...span), Math.max(...span) + 1);
}

function squaresIn(node: SeqNode): Square[] {
  return node.kind === 'square' ? [node] : node.children.flatMap(squaresIn);
}

/** True when the Group button would create or join a group with this selection. */
export function canGroup(track: Track, selection: ReadonlySet<NodeId>): boolean {
  // The probe id is never used: nextId is only called when a group is created, and the result is discarded.
  return groupOrJoin(track, [...selection], () => '__probe__').groupId !== null;
}

/** Selected groups in document order (an outer group before the groups inside it). */
export function selectedGroupIds(track: Track, selection: ReadonlySet<NodeId>): NodeId[] {
  return nodeIds(track).filter((id) => selection.has(id) && findNode(track, id)?.kind === 'group');
}

/** Ungroups each group and returns the former children that still exist afterwards, in document order. */
export function ungroupAll(track: Track, ids: readonly NodeId[]): { track: Track; childIds: NodeId[] } {
  const former = new Set(
    ids.flatMap((id) => {
      const node = findNode(track, id);
      return node?.kind === 'group' ? node.children.map((c) => c.id) : [];
    }),
  );
  const out = ids.reduce(ungroup, track);
  return { track: out, childIds: nodeIds(out).filter((id) => former.has(id)) };
}

/** True when every square targeted by the selection is muted (a group targets its squares). */
export function allMuted(track: Track, selection: ReadonlySet<NodeId>): boolean {
  const squares = [...selection].flatMap((id) => {
    const node = findNode(track, id);
    return node ? squaresOf(node) : [];
  });
  return squares.length > 0 && squares.every((s) => s.muted);
}

function squaresOf(node: SeqNode): Square[] {
  return node.kind === 'square' ? [node] : node.children.flatMap(squaresOf);
}
