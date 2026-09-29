# 02 — Move ops

Status: done
Branch: feat/01-03-core-ops

## Behaviour

`move(track, ids, target)` moves one or more nodes to a `DropTarget` (PLAN.md §2.2). It is the pure core of
drag & drop: the drop indicator gives `target.index` as a position among the parent's children **as currently
displayed, moved items still included**, and `move` works out where they land once they are taken out.

Algorithm (PLAN.md §2.2):

1. Ids that are descendants of other selected ids are dropped (they travel with their ancestor). Unknown and
   duplicate ids are ignored.
2. If `target.parentId` is a moved node or lies inside one → no-op. A missing parent or a square as parent
   → no-op too.
3. Moved nodes are collected in document order (depth-first).
4. `target.index` is clamped to `[0, children.length]`, then
   `adjusted = index − (moved nodes that are direct children of the target parent with original index < index)`.
5. The moved nodes are removed and inserted contiguously at `adjusted` in the target parent, then the track is
   normalized.

A move that would leave everything where it is returns the input track itself.

## Acceptance criteria

- [x] A single square moves forward: `[A,B,C,D]`, move A to index 3 → `[B,C,A,D]`.
- [x] A single square moves backward: `[A,B,C,D]`, move D to index 1 → `[A,D,B,C]`.
- [x] Moving to its own position (index `i` or `i + 1`) leaves the track unchanged (same object).
- [x] Moving to index `length` puts the nodes at the end.
- [x] Moving to index 0 puts the nodes at the start.
- [x] Contiguous multi-select: `[A,B,C,D,E]`, move B,C,D to index 5 → `[A,E,B,C,D]`.
- [x] Non-contiguous multi-select lands contiguous in document order, whatever the order of `ids`:
      `[A,B,C,D,E]`, move `[D,B]` to index 5 → `[A,C,E,B,D]`; to index 0 → `[B,D,A,C,E]`.
- [x] A target index between selected nodes counts only the moved nodes before it:
      `[A,B,C,D,E]`, move B,D to index 3 → `[A,C,B,D,E]`.
- [x] A group moves as a block with its children, and keeps its id and content.
- [x] Selecting a group and one of its descendants moves the group only (the descendant stays inside it).
- [x] Reordering inside a group works like at the root.
- [x] An out-of-range index is clamped.
- [x] No-op (same track returned) when: `ids` is empty or unknown; the target parent does not exist or is a
      square; the target parent is a moved group or inside one.
- [x] Results are normalized, ids stay unique, inputs are not mutated (deep-frozen) and untouched subtrees keep
      their identity.

## Edge cases

- All nodes selected and moved at the root → same order → unchanged.
- The index is interpreted before removal ("as displayed"), so the drop indicator never has to predict the
  result.

## Out of scope

- Moving into / out of groups and the resulting dissolution of groups: specified in 03 (same function).
- Hit-testing a pointer position into a `DropTarget` (08).

## Files

`src/core/ops.ts`, `src/core/ops.move.test.ts`.

## Notes (added during review/doc step)

- Steps 1–3 come from a single pruned pre-order walk that does not go below selected nodes. The selected nodes
  it reaches are the moved nodes, in document order and without selected descendants. Nodes inside a moved
  node are never reached, so if the target parent is not found, it is missing or inside a moved node. Either
  way the move is a no-op.
- Extension to PLAN.md: when the moved nodes already sit contiguously at `adjusted` in the target parent, the
  input track is returned unchanged (the same object), so a drop in place does not trigger scheduler rebuilds or
  autosave.
- The track is not normalized between removal and insertion. Removing nodes can leave the target group with
  fewer than 2 children, and normalizing then would dissolve it before the moved nodes are inserted.
