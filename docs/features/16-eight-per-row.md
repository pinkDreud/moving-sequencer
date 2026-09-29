# 16 — At least 8 slots per row

Status: done
Branch: feat/16-eight-per-row

## Behaviour (user request, 2026-09-30)

The pattern length is free, but the row should wrap ("a capo") depending on the screen, and always hold at least 8
slots. Before this change squares were a fixed 56 px (44 px on phones), so a 360 px phone wrapped after 6 slots.

Now `--slot-size = min(56px, (100cqw − 20px − 7 · gap) / 8)` (`src/ui/global.css`). `100cqw` is the width of the
editor, which is a size container (`container-type: inline-size` in `Editor.svelte`), and 20 px is the strip's
padding. Squares keep 56 px wherever 8 fit (wider screens then fit more per row) and shrink below that: ≈ 34 px at
360 px, ≈ 30 px at 320 px.

## Acceptance criteria

- [x] 320, 360 and 412 px wide screens: the 8 default slots sit on one row, with no horizontal scroll.
- [x] Wide screens keep 56 px squares.
- [x] All drag e2e tests still pass with the smaller phone squares.

## Notes

- Trade-off accepted by the user: on narrow phones the squares are below the 44 px touch-target guideline, and
  children of groups get proportionally thinner.
- With a full row, the only empty strip area is its 10 px padding, so deselecting by tapping empty space is harder
  on phones. The × in the selection bar still clears. The e2e test for "tap on empty area clears" now uses a
  3-slot pattern.
- The rounded strip corner is excluded from hit-testing by browsers: don't click at the exact corner in tests.
