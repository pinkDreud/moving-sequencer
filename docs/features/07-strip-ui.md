# 07 — Strip UI, palette, selection, playhead

Status: planned
Branch: feat/07-strip-ui

## Behaviour

The pattern is visible and editable without drag & drop. The user adds squares from a palette, selects them,
and uses the SelectionBar to mute, change sound, group, ungroup or delete. While playing, the square under the
playhead lights up.

## Acceptance criteria

- [ ] Strip renders top-level slots in a wrapping row. All slots have the same width (≥ 44 px), and each shows its sound color, or a hatched "rest" look if silent.
- [ ] A group renders inside one slot with its children side by side at equal width, nested recursively. The group has a visible outline.
- [ ] Muted squares are dimmed and keep their color hint.
- [ ] Palette: one button per sound plus "Silent". A tap appends a square to the end, or inserts it after the last selected node if there is a selection.
- [ ] Selection: mouse click selects only this node; shift/cmd/ctrl-click toggles it; touch tap toggles it; a tap on the empty strip area clears the selection. Selected squares get `aria-pressed="true"` and a highlight.
- [ ] SelectionBar (visible when something is selected): Mute/Unmute, Sound (applies the palette sound picked next), Group (enabled when ≥ 2 siblings are selected), Ungroup (enabled when a group is selected), Delete. Each calls the pure op from `core/ops.ts`.
- [ ] Playhead: the leaf whose id equals `app.playheadId` gets a `playing` class. Feature 06 keeps `playheadId` up to date; 07 only renders it.
- [ ] Default pattern on first load: 8 slots of a simple beat (kick, hat, snare, hat…).
- [ ] Every square has an `aria-label`: sound name, "silent", plus ", muted" when muted.
- [ ] Component tests (Testing Library) for rendering and selection. e2e: add squares from the palette, group three of them, ungroup, delete.

## Edge cases

- Very deep nesting: children get narrow. Keep a minimum of 6 px and clip the rest (the timing stays correct).
- Keyboard: Delete/Backspace deletes the selection, M toggles mute, G groups, Shift+G ungroups, Escape clears the selection.

## Notes from 01–05

- Keep the song in `$state.raw`: ops return new objects and keep the identity of what is unchanged. A deep `$state`
  proxy or `$state.snapshot` would give a new track on every read, and the scheduler would rebuild the timeline every tick.
- The op `group` clashes by name with the constructor `group` from `model.ts`; alias it on import.

## Out of scope

Drag & drop (08), lasso (08).

## Files

`src/state.svelte.ts`, `src/ui/{Strip,NodeView,Palette,SelectionBar}.svelte`, component tests, `tests/e2e/edit.spec.ts`.
