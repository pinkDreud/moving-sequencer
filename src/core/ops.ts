import type { NodeId, SeqNode, SoundId, Square, Track } from './model';

/** Where to put nodes: `parentId: null` = track root; `index` = position among the parent's current children. */
export interface DropTarget {
  parentId: NodeId | null;
  index: number;
}

/** Position of an existing node, same shape as a drop target that would leave it in place. */
export type NodeLocation = DropTarget;

// ---------- read helpers ----------

/** Finds a node anywhere in the tree. */
export function findNode(track: Track, id: NodeId): SeqNode | undefined {
  return walk(track.nodes, null).find((e) => e.node.id === id)?.node;
}

/** Parent id and index of a node, or `undefined` if it is not in the track. */
export function findLocation(track: Track, id: NodeId): NodeLocation | undefined {
  const entry = walk(track.nodes, null).find((e) => e.node.id === id);
  return entry && { parentId: entry.parentId, index: entry.index };
}

/** All node ids (groups and squares) in document order: depth-first, a group before its children. */
export function nodeIds(track: Track): NodeId[] {
  return walk(track.nodes, null).map((e) => e.node.id);
}

interface Entry {
  node: SeqNode;
  parentId: NodeId | null;
  index: number;
}

/** Pre-order flattening; `prune` stops the descent below the nodes it accepts. */
function walk(nodes: SeqNode[], parentId: NodeId | null, prune?: (n: SeqNode) => boolean): Entry[] {
  return nodes.flatMap((node, index) => {
    const entry: Entry = { node, parentId, index };
    if (node.kind !== 'group' || prune?.(node)) return [entry];
    return [entry, ...walk(node.children, node.id, prune)];
  });
}

/** Every square in the subtree of `node` (itself if it is a square). */
function squaresOf(node: SeqNode): Square[] {
  return node.kind === 'square' ? [node] : node.children.flatMap(squaresOf);
}

// ---------- structural rewriting ----------

/**
 * Bottom-up rewrite: children are rewritten first, then `visit` replaces the node by 0..n nodes.
 * Returns the original array when nothing changed, so untouched subtrees keep their identity.
 */
function rewrite(nodes: SeqNode[], visit: (node: SeqNode) => SeqNode[]): SeqNode[] {
  let changed = false;
  const out = nodes.flatMap((node) => {
    let current = node;
    if (node.kind === 'group') {
      const children = rewrite(node.children, visit);
      if (children !== node.children) current = { ...node, children };
    }
    const replaced = visit(current);
    if (replaced.length !== 1 || replaced[0] !== node) changed = true;
    return replaced;
  });
  return changed ? out : nodes;
}

function withNodes(track: Track, nodes: SeqNode[]): Track {
  return nodes === track.nodes ? track : { ...track, nodes };
}

/** Replaces the children of `parentId` (null = root); `undefined` if that parent is missing or a square. */
function updateChildren(
  track: Track,
  parentId: NodeId | null,
  update: (children: SeqNode[]) => SeqNode[],
): Track | undefined {
  if (parentId === null) return withNodes(track, update(track.nodes));
  if (findNode(track, parentId)?.kind !== 'group') return undefined;
  return withNodes(
    track,
    rewrite(track.nodes, (n) =>
      n.kind === 'group' && n.id === parentId ? [{ ...n, children: update(n.children) }] : [n],
    ),
  );
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

// ---------- operations ----------

/** Enforces the invariants: no empty groups, no single-child groups (recursively). */
export function normalize(track: Track): Track {
  return withNodes(
    track,
    rewrite(track.nodes, (n) => (n.kind === 'group' && n.children.length < 2 ? n.children : [n])),
  );
}

/** Inserts a square at `target`; unchanged if the parent is missing/a square or the id is taken. */
export function insert(track: Track, target: DropTarget, square: Square): Track {
  if (findNode(track, square.id)) return track;
  const out = updateChildren(track, target.parentId, (children) => {
    const at = clamp(target.index, children.length);
    return [...children.slice(0, at), square, ...children.slice(at)];
  });
  return out ? normalize(out) : track;
}

/** Deletes the nodes (with their descendants) and normalizes. */
export function remove(track: Track, ids: readonly NodeId[]): Track {
  const set = new Set(ids);
  return normalize(
    withNodes(
      track,
      rewrite(track.nodes, (n) => (set.has(n.id) ? [] : [n])),
    ),
  );
}

/** Sets the sound of the targeted squares (a group id targets all squares below it). */
export function setSound(track: Track, ids: readonly NodeId[], soundId: SoundId | null): Track {
  return updateSquares(track, targetedSquares(track, ids), (s) =>
    s.soundId === soundId ? s : { ...s, soundId },
  );
}

/** Unmutes the targeted squares if all are muted, else mutes them all (a group id targets its squares). */
export function toggleMute(track: Track, ids: readonly NodeId[]): Track {
  const targets = targetedSquares(track, ids);
  const muted = !targets.every((s) => s.muted);
  return updateSquares(track, targets, (s) => (s.muted === muted ? s : { ...s, muted }));
}

function targetedSquares(track: Track, ids: readonly NodeId[]): Square[] {
  const set = new Set(ids);
  // Pruning below selected nodes counts a square once even if its group is selected too.
  return walk(track.nodes, null, (n) => set.has(n.id))
    .filter((e) => set.has(e.node.id))
    .flatMap((e) => squaresOf(e.node));
}

function updateSquares(track: Track, targets: Square[], update: (s: Square) => Square): Track {
  const set = new Set(targets);
  return withNodes(
    track,
    rewrite(track.nodes, (n) => [n.kind === 'square' && set.has(n) ? update(n) : n]),
  );
}
