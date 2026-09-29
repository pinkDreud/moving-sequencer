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
- [ ] Palette: a way to add a square to the prep area (decide in the spec refinement step, e.g. a "+ to Prepare"
      target, or append to whichever area was last focused).
- [ ] Drag prep → pattern copies (fresh ids, the prep area unchanged); with Alt held, it moves.
- [ ] Drag pattern → prep moves.
- [ ] Drop onto the middle of a pattern square combines, as in 08; delete by dropping outside both areas.
- [ ] Group, Ungroup, Mute and Delete work on prep selections; the scheduler never plays the prep area.
- [ ] Reload → the prep area is empty; the pattern is restored as before.
- [ ] All drag e2e tests from 08 still pass; new e2e: copy from prep while playing is heard on the next loop; Alt
      moves; pattern → prep moves.

## Risks

This touches the drag controller (hardened in 08). The existing drag e2e suite must stay green unchanged.
