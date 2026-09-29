# 08 — Drag & drop (live rearranging)

Status: done
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

- [x] Pointer over a square: left half → before it, right half → after it, in the square's parent.
- [x] Pointer over a group: outer 20 % on the left → before the group, outer 20 % on the right → after the group (in
      the group's parent). Inner area → inside the group, at the index given by how many children have their
      center left of the pointer.
- [x] Nested groups: the innermost element under the pointer decides.
- [x] Pointer in a gap or past the end of a row: use the top-level row whose vertical range contains the pointer
      (or the nearest row); within it, the horizontally nearest item. Left of its center → before it, else after it.
- [x] Empty track → `{ parentId: null, index: 0 }`.
- [x] Pointer further than `deleteMargin` (default 40 px) outside the strip rect → `delete`.
- [x] Each move result carries an indicator `{ x, top, bottom }` for drawing a vertical insertion line.

### Drag controller + UI

- [x] Mouse/pen: a drag starts after 6 px of movement with the button held. A plain click still selects.
- [x] Touch: a long-press (300 ms without moving more than 8 px) picks up; then moving drags. A quick swipe still
      scrolls the page, and a tap still selects.
- [x] Dragging a selected node drags the whole selection. Dragging an unselected node drags only it (the
      selection becomes that node). Groups drag as one block.
- [x] While dragging: dragged nodes are dimmed in place, a ghost follows the pointer, and the insertion line shows
      the target. Near the strip's outside, a "release to delete" state is shown.
- [x] Drop → `app.updateTrack(t => move(t, ids, target))`; drop in delete zone → `remove`. Escape or
      `pointercancel` aborts without changes.
- [x] Works while playing: the scheduler picks up the new order on its next tick (covered by 05; the e2e checks it).
- [x] e2e on all 4 projects: drag a square to a new position; drag three selected squares after the last one; drag
      a square into a group (the group gets one more child); drag a square out of a 2-child group (the group
      dissolves); drag off the strip deletes; with `?fake-audio` and playing, after reordering, the scheduled
      sound order follows the new order.

## Edge cases

- Dropping onto the dragged nodes themselves or inside a dragged group → `move` returns the same track (no-op).
- The layout snapshot is taken at drag start and refreshed on scroll/resize. The dragged nodes stay in the layout,
  because `move` interprets indices "as displayed, moved items still included".
- The page must not scroll or select text while dragging (`touch-action`, `user-select`, pointer capture).

## Notes

- dropTarget: the innermost element under the pointer wins. A group's 20 % edge zones only apply when the pointer is
  on the group's own frame/padding, not over a child. Otherwise the first/last positions inside a group would be
  unreachable. "Before/after a group" is reachable through the gaps between slots and the neighbours' halves.
- Clipping: groups clip their children (`overflow: hidden`, children have `min-width: 6px`), so in a dense group the
  last children overflow invisibly over the next slot. A child only counts as hit where the pointer is also inside
  every ancestor's rect.
- Gesture (`ui/drag.ts`) states: idle → pending → dragging → idle, plus `aborted` (cancelled while still pressed:
  the release must not click). One pointer at a time; other pointers' down/cancel are ignored.
- Click after drop: the browser's click that follows the drop's pointerup must not change the selection. The swallow
  ends at the next `pointerdown` anywhere (window capture). A `setTimeout(0)` does **not** work: Chrome runs queued
  input before timers, and a fast next click was being eaten (the review found this, and an e2e test covers it).
- Stuck drags: a mouse/pen move with `buttons === 0`, window `blur` or `visibilitychange` cancels. Otherwise a lost
  pointerup would turn the next click into a drop (possibly a delete).
- Pressing inside a selected group drags the selection: on touch the group frame (5 px) is too thin to grab.
- Touch scroll: the strip keeps `touch-action: manipulation`. Once something is picked up, a non-passive window
  `touchmove` listener calls `preventDefault`, so the finger moves the square and not the page.
- Performance: the dragged ids live in their own `$state.raw` (set at pick-up), apart from the per-move pointer
  state, so NodeViews don't re-render on every pointermove. The layout is re-measured on every move, which is fine
  for pattern-sized DOMs.
- Review (reviewer subagent): 7 findings, all fixed with regression tests (unit + e2e) in `[TEST]`/`[BUGFIX]` commits.
- Not verified on real devices: iOS Safari long-press (system callout timing vs our 300 ms), Apple Pencil
  (pen uses the 6 px mouse threshold). The touch e2e runs on Chromium only (CDP touch events).
- Known limit: if a group's first child is itself a group, "before the inner group, inside the outer one" has no
  pointer position. The same structure can be reached in two moves.

## Out of scope

Lasso selection (a follow-up feature if still wanted), auto-scroll during drag of very long patterns, undo.

## Files

`src/core/dropTarget.ts` (+test), `src/ui/drag.ts` (+test), `src/ui/Strip.svelte`, `src/ui/NodeView.svelte`,
`tests/e2e/drag.spec.ts`.
