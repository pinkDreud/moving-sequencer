# 08 — Drag & drop (live rearranging)

Status: in progress
Branch: feat/08-drag-drop

## Behaviour

The heart of the app. While the pattern plays, the user picks up one square, a multi-selection or a whole
group and drops it somewhere else: before or after any node, inside a group (changing its subdivision), or out
of a group. Dropping outside the strip deletes. The change is heard on the next subdivision.

Two parts:

1. `src/core/dropTarget.ts`: pure hit-testing. Given the pointer position and a layout snapshot (rects of every
   node), it returns where a drop would land. Fully unit-tested with synthetic rects.
2. `src/ui/drag.ts` + Strip integration: a pointer-events controller that works for mouse, touch and pen, draws a
   ghost and a drop indicator, and calls `move` / `remove` on drop.

## Acceptance criteria

### dropTarget (pure)

- [ ] Pointer over a square: left half → before it, right half → after it, in the square's parent.
- [ ] Pointer over a group: outer 20 % on the left → before the group, outer 20 % on the right → after the group (in
      the group's parent). Inner area → inside the group, at the index given by how many children have their
      center left of the pointer.
- [ ] Nested groups: the innermost element under the pointer decides.
- [ ] Pointer in a gap or past the end of a row: use the top-level row whose vertical range contains the pointer
      (or the nearest row); within it, the horizontally nearest item. Left of its center → before it, else after it.
- [ ] Empty track → `{ parentId: null, index: 0 }`.
- [ ] Pointer further than `deleteMargin` (default 40 px) outside the strip rect → `delete`.
- [ ] Each move result carries an indicator `{ x, top, bottom }` for drawing a vertical insertion line.

### Drag controller + UI

- [ ] Mouse/pen: a drag starts after 6 px of movement with the button held. A plain click still selects.
- [ ] Touch: a long-press (300 ms without moving more than 8 px) picks up; then moving drags. A quick swipe still
      scrolls the page, and a tap still selects.
- [ ] Dragging a selected node drags the whole selection. Dragging an unselected node drags only it (the
      selection becomes that node). Groups drag as one block.
- [ ] While dragging: dragged nodes are dimmed in place, a ghost follows the pointer, and the insertion line shows
      the target. Near the strip's outside, a "release to delete" state is shown.
- [ ] Drop → `app.updateTrack(t => move(t, ids, target))`; drop in delete zone → `remove`. Escape or
      `pointercancel` aborts without changes.
- [ ] Works while playing: the scheduler picks up the new order on its next tick (covered by 05; the e2e checks it).
- [ ] e2e on all 4 projects: drag a square to a new position; drag three selected squares after the last one; drag
      a square into a group (the group gets one more child); drag a square out of a 2-child group (the group
      dissolves); drag off the strip deletes; with `?fake-audio` and playing, after reordering, the scheduled
      sound order follows the new order.

## Edge cases

- Dropping onto the dragged nodes themselves or inside a dragged group → `move` returns the same track (no-op).
- The layout snapshot is taken at drag start and refreshed on scroll/resize. The dragged nodes stay in the layout,
  because `move` interprets indices "as displayed, moved items still included".
- The page must not scroll or select text while dragging (`touch-action`, `user-select`, pointer capture).

## Out of scope

Lasso selection (a follow-up feature if still wanted), auto-scroll during drag of very long patterns, undo.

## Files

`src/core/dropTarget.ts` (+test), `src/ui/drag.ts` (+test), `src/ui/Strip.svelte`, `src/ui/NodeView.svelte`,
`tests/e2e/drag.spec.ts`.
