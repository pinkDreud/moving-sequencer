// Pure selection helpers used by the strip, the palette and the selection bar.
import type { NodeId, SeqNode, Square, Track } from '../core/model';
import { findLocation, findNode, group, nodeIds, ungroup, type DropTarget } from '../core/ops';

export type SelectMode = 'replace' | 'toggle';

export interface PointerLike {
  pointerType: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
}

/** Mouse/pen/keyboard click replaces the selection; a modifier or a touch tap toggles (no modifiers on phones). */
export function selectMode(e: PointerLike): SelectMode {
  return e.pointerType === 'touch' || e.shiftKey || e.metaKey || e.ctrlKey ? 'toggle' : 'replace';
}

/** Where a palette square goes: after the last selected node in document order, else at the end of the root. */
export function insertTarget(track: Track, selection: ReadonlySet<NodeId>): DropTarget {
  const last = nodeIds(track)
    .filter((id) => selection.has(id))
    .at(-1);
  const at = last === undefined ? undefined : findLocation(track, last);
  return at ? { parentId: at.parentId, index: at.index + 1 } : { parentId: null, index: track.nodes.length };
}

/** True when the Group op would create a group from this selection. */
export function canGroup(track: Track, selection: ReadonlySet<NodeId>): boolean {
  // The probe id is never used: `group` only calls nextId when it succeeds, and we discard the result.
  return group(track, [...selection], () => '__probe__').groupId !== null;
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
