# 15 — Editing keys: Delete empties, Ins inserts, Shift+click range

Status: done
Branch: feat/15-editing-keys

## Behaviour (user feedback, 2026-09-29, in Italian)

"Delete should not make the selection disappear. Ins should insert an empty slot. Shift+click should select everything
up to here (Ctrl works fine)." The user's choices:

- **Delete / Backspace** empty the selected squares: they become silent slots (sound `null`, unmuted). The pattern
  keeps its length and the selection stays. A group in the selection empties all its squares.
- Removing is still possible: **Shift+Delete / Shift+Backspace**, the selection bar's **Remove** button (was
  "Delete"), or dragging off the strips. The bar also gets an **Empty** button, since phones have no Delete key.
- **Ins** (or **I**: Mac keyboards have no Insert key) inserts an empty slot **before** the first selected node (in
  its parent, so inside a group when that node is in one). The selection stays on the same squares. With nothing
  selected, it appends to the active area.
- **Shift+click** selects from the anchor (the last node clicked without Shift) to the clicked node. Same parent →
  the siblings in between (a group stays one block). Different levels → every square in between, in time order.
  No anchor, or the anchor in the other area → just the clicked node. **Ctrl/Cmd+click** toggles, as before.
  Touch taps still toggle.

## Acceptance criteria

- [x] `emptySquares(track, ids)` pure op (same track when nothing changes).
- [x] `rangeIds(track, anchor, target)` pure; `selectMode` returns `'range'` for Shift.
- [x] Actions `emptySelection`, `insertEmpty`; shortcuts `empty`, `remove`, `insert`.
- [x] Selection bar: Empty, Remove.
- [x] e2e (desktop): Shift+click range, Delete empties and keeps the selection, Ins inserts before.

## Notes

- The anchor (`AppState.anchor`) is set by plain and Ctrl/Cmd clicks, not by Shift+clicks, so repeated Shift+clicks
  re-span from the same start, like in file managers.
- Existing e2e tests that used Shift+click to add to the selection now use Ctrl/Cmd (`ControlOrMeta`), which was their
  intent.
- Without a selection, only Ins acts (it appends); Delete/Backspace/Escape keep the browser default.
