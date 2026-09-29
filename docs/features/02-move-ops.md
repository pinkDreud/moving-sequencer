# 02 — Move ops

Status: in progress
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

- [ ] A single square moves forward: `[A,B,C,D]`, move A to index 3 → `[B,C,A,D]`.
- [ ] A single square moves backward: `[A,B,C,D]`, move D to index 1 → `[A,D,B,C]`.
- [ ] Moving to its own position (index `i` or `i + 1`) leaves the track unchanged (same object).
- [ ] Moving to index `length` puts the nodes at the end.
- [ ] Moving to index 0 puts the nodes at the start.
- [ ] Contiguous multi-select: `[A,B,C,D,E]`, move B,C,D to index 5 → `[A,E,B,C,D]`.
- [ ] Non-contiguous multi-select lands contiguous in document order, whatever the order of `ids`:
      `[A,B,C,D,E]`, move `[D,B]` to index 5 → `[A,C,E,B,D]`; to index 0 → `[B,D,A,C,E]`.
- [ ] A target index between selected nodes counts only the moved nodes before it:
      `[A,B,C,D,E]`, move B,D to index 3 → `[A,C,B,D,E]`.
- [ ] A group moves as a block with its children, and keeps its id and content.
- [ ] Selecting a group and one of its descendants moves the group only (the descendant stays inside it).
- [ ] Reordering inside a group works like at the root.
- [ ] An out-of-range index is clamped.
- [ ] No-op (same track returned) when: `ids` is empty or unknown; the target parent does not exist or is a
      square; the target parent is a moved group or inside one.
- [ ] Results are normalized, ids stay unique, inputs are not mutated (deep-frozen) and untouched subtrees keep
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
