import type { NodeId, SeqNode, SoundId, Track } from './model';

/** One square placed in time. `start` and `duration` are in slots. */
export interface Leaf {
  nodeId: NodeId;
  soundId: SoundId | null;
  audible: boolean;
  start: number;
  duration: number;
}

/** A track flattened into time-ordered leaves that tile `[0, length)`. */
export interface Timeline {
  length: number;
  leaves: Leaf[];
}

/** Tolerance (in slots) for float comparisons: thirds and other tuplets are not exact in binary. */
export const EPSILON = 1e-9;

const span = (node: SeqNode): number => (node.kind === 'group' ? node.span : 1);

function leavesOf(node: SeqNode, start: number, duration: number): Leaf[] {
  if (node.kind === 'square') {
    const { id, soundId, muted } = node;
    return [{ nodeId: id, soundId, audible: soundId !== null && !muted, start, duration }];
  }
  const n = node.children.length;
  return node.children.flatMap((child, i) => leavesOf(child, start + (i * duration) / n, duration / n));
}

/** Flattens a track into timed leaves: top-level nodes take their span, groups split evenly and recursively. */
export function buildTimeline(track: Track): Timeline {
  let offset = 0;
  const leaves = track.nodes.flatMap((node) => {
    const start = offset;
    offset += span(node);
    return leavesOf(node, start, span(node));
  });
  return { length: offset, leaves };
}

/** The leaf whose `[start, start + duration)` contains `position`, or `undefined` outside `[0, length)`. */
export function leafAt(timeline: Timeline, position: number): Leaf | undefined {
  if (position < -EPSILON || position >= timeline.length) return undefined;
  // Leaves are time-ordered and contiguous: the last one starting at or before `position` contains it.
  for (let i = timeline.leaves.length - 1; i >= 0; i--) {
    const leaf = timeline.leaves[i];
    if (leaf && leaf.start <= position + EPSILON)
      return position < leaf.start + leaf.duration ? leaf : undefined;
  }
  return undefined;
}
