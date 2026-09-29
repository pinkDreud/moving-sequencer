# 14 — Preparation area

Status: planned
Branch: feat/14-prep-area

## Behaviour

Below the pattern there is a small second strip, the preparation area. It never plays. You build a note or a
figure there (add sounds, group them) and drag it into the playing pattern. Dragging from the area **copies** by
default, so the same figure can be dropped several times; holding Alt/Option while dropping **moves** instead
(desktop). Dragging from the pattern into the area moves. The area is scratch space: not saved, empty after a reload.

## Design

- The area is a second `Track` held in `AppState` (not in `Song`, so autosave and the scheduler never see it).
- Ops stay single-track. A new pure op moves or copies nodes between two tracks: remove from the source (for a move),
  deep-clone with fresh ids from `nextId` (for a copy), insert at the target.
- Drag & drop is lifted from `Strip` to `Editor`: one gesture and one layout snapshot cover both strips. Every
  layout item knows its area (`'pattern' | 'prep'`), and `dropTarget` returns the area with the target. `Strip`
  becomes a view of one track with an `area` prop; selection works across both areas (ids are unique song-wide,
  because they come from the same `nextId`).
- Palette taps with nothing selected append to the pattern, as today. With squares selected in the prep area they
  set those squares' sound, as in the pattern.
- The Group, Ungroup, Mute and Delete buttons work on the prep area too.

## Acceptance criteria

- [ ] Prep area visible under the pattern, labelled ("Prepare"), empty by default, with a hint while empty.
- [ ] Palette: with nothing selected, a tap appends to the **active area** (the one last tapped; the pattern by
      default), which is outlined. With a selection it sets the sound of the selected squares, in either area.
- [ ] Drag prep → pattern copies (fresh ids, the prep area unchanged); with Alt held, it moves.
- [ ] Drag pattern → prep moves.
- [ ] Drop onto the middle of a pattern square combines, as in 08; delete by dropping outside both areas.
- [ ] Group, Ungroup, Mute and Delete work on prep selections; the scheduler never plays the prep area.
- [ ] Reload → the prep area is empty; the pattern is restored as before.
- [ ] All drag e2e tests from 08 still pass; new e2e: copy from prep while playing is heard on the next loop; Alt
      moves; pattern → prep moves.

## Details (refined before coding)

- **Layout**: pattern, palette, then the prep area (heading "Prepare", a strip `section` with
  `aria-label="Prepare"`), then the selection bar. The palette sits between the two strips, so the prep area is
  not within the pattern's 40 px delete margin (08's e2e drops 15 px and 120 px below the pattern must still mean
  "move" and "delete").
- **Adding squares to the prep area — the active area.** A tap (click) in a strip, on a square or on its empty
  space, makes that strip the active area. It is outlined in the accent color. With nothing selected, a palette tap
  appends a square to the end of the active area. The pattern is active at start. The empty prep area shows a hint:
  "Tap here, then pick sounds to build a figure. Drag it into the pattern to copy it." Rejected alternatives: a
  "+" button in the prep area (it needs a second step to choose the sound) and an "Add to: Pattern | Prepare"
  switch (more UI for the same state). With a selection, palette taps set the sound as before (issue #1), whatever
  the active area; the selection can be in either area.
- **Drops.** Pattern → pattern and prep → prep move, as in 08. Pattern → prep moves. Prep → pattern **copies**:
  the dragged nodes are deep-cloned with fresh ids (groups keep their structure), and the prep area is unchanged.
  Alt/Option held at release moves instead. Combine (onto the middle of a top-level square) works across areas,
  copying or moving the same way. After a copy, the copies are the selection. While a drop would copy, the ghost
  shows "Copy"; the ghost follows the Alt key of the pointer moves.
- **Touch has no Alt**: from a phone, a drag from the prep area always copies. To move, copy and then delete the
  original (drag it out, or Delete).
- **Delete**: releasing more than 40 px outside **both** strips deletes from the source area. Between the strips,
  the nearer strip within 40 px takes the drop.
- **Selection across areas**: a mixed selection (squares in both areas, via shift/cmd-click or touch taps) is
  allowed. Mute, Delete, Ungroup and palette sound taps act on both areas (the Mute/Unmute label considers every
  selected square). **Group is disabled** for a mixed selection (a group can't span two strips), and G does
  nothing. Dragging from a mixed selection drags only the selected nodes of the area pressed in.
- **State**: `app.prep` (a `Track`, `$state.raw`, empty at start) and `app.activeArea` live in `AppState`, not in
  `Song`, so autosave and the scheduler never see them. `app.updateArea(area, op)` applies an op to one area;
  `app.setTracks({ pattern, prep })` replaces both at once (a cross-area drop), pruning the selection once.
  Deleting a recording also silences its squares in the prep area.
- **Pure op**: `transfer(from, to, ids, place, { copy, nextId })` in `core/ops.ts` moves or copies the nodes into
  another track, at a `DropTarget` or onto a square (combine). `dropTargetIn(p, items, areas)` in
  `core/dropTarget.ts` picks the area (by distance) and runs `dropTarget` on its items; the result carries `area`.

## Risks

This touches the drag controller (hardened in 08). The existing drag e2e suite must stay green unchanged.
