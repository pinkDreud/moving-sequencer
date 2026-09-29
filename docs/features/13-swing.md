# 13 — Swing

Status: planned
Branch: feat/13-swing

## Behaviour

A swing control (0–75 %) delays every second slot: slots are taken in pairs (0–1, 2–3, …) and the first slot of each
pair gets longer while the second gets shorter. At 1/8 slots this is classic 8th swing; at 1/16 it is 16th swing.
Groups inside a slot swing along with it (their tuplets are stretched or squeezed with the slot).

## Design

Time is warped instead of shifting individual notes. With the offbeat delay `d` (in slots, derived from the swing
knob), within each pair of slots `[0, 2)`:

- `0 ≤ p < 1` → `warp(p) = p · (1 + d)`: the first slot is stretched to length `1 + d`.
- `1 ≤ p < 2` → `warp(p) = (1 + d) + (p − 1) · (1 − d)`: the second slot is squeezed to length `1 − d`.

The pair still lasts exactly 2 slots, so the loop length is unchanged. Knob → delay: `d = swing` as a fraction of a
slot, with `swing ∈ [0, 0.75]`. 0 = straight, ≈ 0.33 = triplet feel (the offbeat lands at 4/3), 0.75 = hard
dotted feel. `warp(p)` and its inverse `unwarp(p)` are pure functions in `core/timing.ts`.

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
