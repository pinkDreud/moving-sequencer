import {
  group as makeGroup,
  type IdGen,
  type NodeId,
  type SeqNode,
  type SoundId,
  type Square,
  type Track,
} from './model';

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

/** The track without the given nodes (not normalized). */
function without(track: Track, ids: ReadonlySet<NodeId>): Track {
  return withNodes(
    track,
    rewrite(track.nodes, (n) => (ids.has(n.id) ? [] : [n])),
  );
}

function clamp(index: number, length: number): number {
  return Math.max(0, Math.min(index, length));
}

function spliceIn(children: SeqNode[], index: number, nodes: SeqNode[]): SeqNode[] {
  const at = clamp(index, children.length);
  return [...children.slice(0, at), ...nodes, ...children.slice(at)];
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
  const out = updateChildren(track, target.parentId, (children) =>
    spliceIn(children, target.index, [square]),
  );
  return out ? normalize(out) : track;
}

/** Deletes the nodes (with their descendants) and normalizes. */
export function remove(track: Track, ids: readonly NodeId[]): Track {
  return normalize(without(track, new Set(ids)));
}

/** Sets the sound of the targeted squares (a group id targets all squares below it). */
export function setSound(track: Track, ids: readonly NodeId[], soundId: SoundId | null): Track {
  return updateSquares(track, targetedSquares(track, ids), (s) =>
    s.soundId === soundId ? s : { ...s, soundId },
  );
}

/** Turns every square playing `soundId` into a plain (unmuted) silent square, e.g. when that sound is deleted. */
export function clearSound(track: Track, soundId: SoundId): Track {
  return withNodes(
    track,
    rewrite(track.nodes, (n) => [
      n.kind === 'square' && n.soundId === soundId ? { ...n, soundId: null, muted: false } : n,
    ]),
  );
}

/** Turns the targeted squares into empty slots (silent, unmuted); a group id targets all squares below it. */
export function emptySquares(track: Track, ids: readonly NodeId[]): Track {
  return updateSquares(track, targetedSquares(track, ids), (s) =>
    s.soundId === null && !s.muted ? s : { ...s, soundId: null, muted: false },
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

/**
 * Moves nodes to `target` (index as displayed, moved nodes still included). They land contiguously in
 * document order; descendants of selected groups travel with them; dropping into a moved node is a no-op.
 */
export function move(track: Track, ids: readonly NodeId[], target: DropTarget): Track {
  const selected = new Set(ids);
  // Not descending below selected nodes drops selected descendants and hides every node inside a moved one.
  const visible = walk(track.nodes, null, (n) => selected.has(n.id));
  const moved = visible.filter((e) => selected.has(e.node.id));
  const { parentId } = target;
  const parent = parentId === null ? undefined : visible.find((e) => e.node.id === parentId)?.node;
  if (moved.length === 0) return track;
  if (parentId !== null && (parent?.kind !== 'group' || selected.has(parentId))) return track;

  const siblings = parent?.kind === 'group' ? parent.children : track.nodes;
  const index = clamp(target.index, siblings.length);
  const adjusted = index - moved.filter((e) => e.parentId === parentId && e.index < index).length;
  if (moved.every((e, i) => e.parentId === parentId && e.index === adjusted + i)) return track;

  const nodes = moved.map((e) => e.node);
  // Normalize only at the end: the target parent may be transiently under-full after the removal.
  const rest = without(track, new Set(nodes.map((n) => n.id)));
  const out = updateChildren(rest, parentId, (children) => spliceIn(children, adjusted, nodes));
  return out ? normalize(out) : track;
}

/**
 * Wraps ≥ 2 siblings into a new group (id from `nextId`) at the first one's position, children in document
 * order. Otherwise — or when they are every child of a group — returns the track unchanged and `groupId: null`.
 */
export function group(
  track: Track,
  ids: readonly NodeId[],
  nextId: IdGen,
): { track: Track; groupId: NodeId | null } {
  const selected = new Set(ids);
  const entries = walk(track.nodes, null).filter((e) => selected.has(e.node.id));
  const [first] = entries;
  if (!first || entries.length < 2 || entries.some((e) => e.parentId !== first.parentId)) {
    return { track, groupId: null };
  }
  const { parentId } = first;
  // Wrapping all children of a group would create a single-child group that normalize dissolves again.
  const parent = parentId === null ? undefined : findNode(track, parentId);
  if (parent?.kind === 'group' && parent.children.length === entries.length) return { track, groupId: null };

  const groupId = nextId();
  const wrapper = makeGroup(
    groupId,
    entries.map((e) => e.node),
  );
  // Entries share a parent and come in index order, so nothing before `first.index` is removed.
  const out = updateChildren(track, parentId, (children) =>
    spliceIn(
      children.filter((c) => !selected.has(c.id)),
      first.index,
      [wrapper],
    ),
  );
  return out ? { track: normalize(out), groupId } : { track, groupId: null };
}

/** Replaces a group by its children, in place inside its parent. */
export function ungroup(track: Track, groupId: NodeId): Track {
  return normalize(
    withNodes(
      track,
      rewrite(track.nodes, (n) => (n.kind === 'group' && n.id === groupId ? n.children : [n])),
    ),
  );
}

/**
 * What the Group button does. If the selection contains one group (or squares inside one) plus nodes right
 * outside it, those nodes join that group in timeline order. Otherwise it is `group`: a new group, which nests
 * when every selected node sits inside the same group.
 */
export function groupOrJoin(
  track: Track,
  ids: readonly NodeId[],
  nextId: IdGen,
): { track: Track; groupId: NodeId | null } {
  const selected = new Set(ids);
  const entries = walk(track.nodes, null, (n) => selected.has(n.id)).filter((e) => selected.has(e.node.id));
  const unchanged = { track, groupId: null };
  if (entries.length < 2) return unchanged;
  const parents = [...new Set(entries.map((e) => e.parentId))];
  if (parents.length === 1) {
    const groups = entries.filter((e) => e.node.kind === 'group');
    const [only] = groups;
    if (groups.length !== 1 || !only) return group(track, ids, nextId);
    return join(
      track,
      only.node.id,
      entries.filter((e) => e !== only).map((e) => e.node.id),
    );
  }
  if (parents.length === 2) {
    const [a = null, b = null] = parents;
    // One parent is a group sitting directly in the other: the outside nodes join it.
    const pairs: [NodeId | null, NodeId | null][] = [
      [a, b],
      [b, a],
    ];
    for (const [inner, outer] of pairs) {
      if (inner !== null && findLocation(track, inner)?.parentId === outer) {
        return join(
          track,
          inner,
          entries.filter((e) => e.parentId === outer).map((e) => e.node.id),
        );
      }
    }
  }
  return unchanged;
}

/** Moves outside nodes into `groupId`: those before it go to its start, those after it to its end. */
function join(track: Track, groupId: NodeId, ids: NodeId[]): { track: Track; groupId: NodeId } {
  const order = nodeIds(track);
  const at = order.indexOf(groupId);
  const before = ids.filter((id) => order.indexOf(id) < at);
  const after = ids.filter((id) => order.indexOf(id) > at);
  let out = move(track, before, { parentId: groupId, index: 0 });
  const g = findNode(out, groupId);
  out = move(out, after, { parentId: groupId, index: g?.kind === 'group' ? g.children.length : 0 });
  return { track: out, groupId };
}

/** Where `transfer` puts nodes: at a drop target, or onto a square (grouped with it, like `combine`). */
export type Placement = { at: DropTarget } | { onto: NodeId };

/** A deep copy of `node` where every node gets a fresh id from `nextId`. */
function cloneFresh(node: SeqNode, nextId: IdGen): SeqNode {
  if (node.kind === 'square') return { ...node, id: nextId() };
  const id = nextId();
  return makeGroup(
    id,
    node.children.map((c) => cloneFresh(c, nextId)),
  );
}

/**
 * Moves (or, with `copy`, deep-copies with fresh ids) nodes of `from` into another track `to`, in document order.
 * Descendants of selected groups travel with them. `ids` are the top-level placed nodes in `to`. When nothing can
 * be placed (no id in `from`, or a missing/square target parent or combine target), both tracks come back unchanged.
 */
export function transfer(
  from: Track,
  to: Track,
  ids: readonly NodeId[],
  place: Placement,
  { copy, nextId }: { copy: boolean; nextId: IdGen },
): { from: Track; to: Track; ids: NodeId[] } {
  const unchanged = { from, to, ids: [] };
  const selected = new Set(ids);
  const picked = walk(from.nodes, null, (n) => selected.has(n.id))
    .filter((e) => selected.has(e.node.id))
    .map((e) => e.node);
  if (picked.length === 0) return unchanged;

  const target = 'at' in place ? place.at : findLocation(to, place.onto);
  if (!target) return unchanged;
  if (target.parentId !== null && findNode(to, target.parentId)?.kind !== 'group') return unchanged;
  if ('onto' in place && findNode(to, place.onto)?.kind !== 'square') return unchanged;

  const nodes = copy ? picked.map((n) => cloneFresh(n, nextId)) : picked;
  const placedIds = nodes.map((n) => n.id);
  const index = 'at' in place ? target.index : target.index + 1;
  let out = updateChildren(to, target.parentId, (children) => spliceIn(children, index, nodes));
  if (!out) return unchanged;
  out = normalize(out);
  if ('onto' in place) out = groupOrJoin(out, [place.onto, ...placedIds], nextId).track;
  return { from: copy ? from : remove(from, placedIds), to: out, ids: placedIds };
}

/**
 * Drops `ids` onto the square `targetId`: they are placed right after it and grouped with it (`groupOrJoin`, so a
 * dragged group absorbs the target). Unchanged when the target is one of the dragged nodes or inside one.
 */
export function combine(track: Track, ids: readonly NodeId[], targetId: NodeId, nextId: IdGen): Track {
  const selected = new Set(ids);
  const target = findLocation(track, targetId);
  if (!target) return track;
  for (let id: NodeId | null = targetId; id !== null; id = findLocation(track, id)?.parentId ?? null) {
    if (selected.has(id)) return track;
  }
  const placed = move(track, ids, { parentId: target.parentId, index: target.index + 1 });
  const result = groupOrJoin(placed, [targetId, ...ids], nextId);
  return result.groupId === null ? track : result.track;
}
