# 07 — Strip UI, palette, selection, playhead

Status: in progress
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

## Details (refined before coding)

- **Palette insertion**: with a selection, the new square goes right after the last selected node in document
  order (a group comes before its children), inside that node's parent, and **becomes the selection**. Tapping
  Kick, Snare, Hat after selecting A gives `A Kick Snare Hat`, like a text cursor. With no selection it is
  appended at the end of the root and the selection stays empty.
- **Sound mode**: the SelectionBar "Sound" button arms a one-shot mode (`aria-pressed="true"`). The next palette
  tap applies `setSound` to the selection instead of inserting, then the mode turns off. Tapping Sound again, or
  an empty selection, turns it off too. A group in the selection targets all squares below it.
- **Mute/Unmute** label: "Unmute" when every square targeted by the selection is muted, else "Mute".
- **Group** is enabled when `group(track, selection)` would return a `groupId` (≥ 2 siblings, not every child of
  a group). After grouping, the new group is the selection.
- **Ungroup** is enabled when the selection contains a group; it ungroups every selected group (outer first) and
  selects their former children that still exist.
- **Delete** removes the selection (descendants too). **Clear** (×) empties the selection.
- **Group selection**: a group has a frame (a `<button>` behind its children, visible as a few px of padding).
  Tapping the frame selects the group; tapping a child selects the child. No nested interactive elements.
- **Pointer type**: the strip records `pointerType` on `pointerdown`; the following `click` uses it
  (`touch` → toggle). Keyboard activation (Enter/Space on a focused square) behaves like a mouse click.
- **DOM contract for 08**: every node's outer element carries `data-node-id`; top-level slots are the direct
  children of the strip (`section.strip`, `aria-label="Pattern"`); a group's children are inside its
  `.children` element. The slot size is the CSS variable `--slot-size` (56 px, 44 px on narrow screens).
- Keyboard shortcuts are ignored while focus is in an input, select, textarea or contenteditable element, and
  when Ctrl/Cmd/Alt is held (so browser shortcuts keep working).
- Unknown sound id (e.g. a deleted recording): grey square, labelled with the id.

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

`src/ui/{Editor,Strip,NodeView,Palette,SelectionBar}.svelte`, `src/ui/selection.ts` (pure helpers),
`src/ui/actions.ts` (selection actions on `AppState`), `src/ui/shortcuts.ts`, component/unit tests,
`tests/e2e/edit.spec.ts`. `Editor.svelte` holds the pieces together (sound mode, keyboard) so `App.svelte`
only mounts it.
