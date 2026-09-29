# 13 — Swing

Status: planned
Branch: feat/13-swing

## Behaviour

A swing control (0–75 %) delays every second slot: slots are taken in pairs (0–1, 2–3, …) and the first slot of each
pair gets longer while the second gets shorter. At 1/8 slots this is classic 8th swing; at 1/16 it is 16th swing.
Groups inside a slot swing along with it (their tuplets are stretched or squeezed with the slot).

## Design

Time is warped instead of shifting individual notes. With swing `s` (0–0.75), a pair of slots covering `[0, 2)`
maps position `p` to swung position:

- `p < 1` → `p · (1 + s/… )`: the first slot is stretched to length `1 + d`.
- `p ≥ 1` → the second slot is squeezed to length `1 − d`.

Here `d = s / 2` (the offbeat moves by `d` slots; 50 % swing → offbeat at 1.25, i.e. a triplet feel at ≈ 66 %). The
exact mapping between the knob and `d` is fixed in the spec refinement step. `warp(p)` and its inverse `unwarp(p)`
are pure functions in `core/timing.ts`.

## Acceptance criteria

- [ ] `Song.swing?: number` in [0, 0.75] (missing = 0). `AppState.setSwing(v)` clamps the value.
- [ ] `warp`/`unwarp` are pure, monotonic, exact inverses, and the identity at swing 0 (property-style unit tests,
      including for tuplet positions inside a slot).
- [ ] The scheduler schedules each note at `warp(leaf.start)`. Loop wrap, exactly-once scheduling and live edits all
      keep working (the existing scheduler tests run unchanged at swing 0 and gain swing variants).
- [ ] With an odd number of slots, the last slot stays unswung, so the loop length in time never changes.
- [ ] `positionAt` uses `unwarp`, so the playhead highlights the right square with swing on.
- [ ] Transport: a swing slider (0–75 %, step 1) with its value shown, ≥ 44 px touch target, fits 360 px.
- [ ] Saved and restored with autosave; `parseSong` validates the range.
- [ ] e2e (`?fake-audio`): with swing on, the gaps between notes alternate long/short.

## Out of scope

A swing grid independent of the slot value (the user chose pairs of slots).
