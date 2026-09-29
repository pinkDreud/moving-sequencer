# 13 — Swing

Status: done
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

### Details (refined before coding)

- Signatures: `warp(position, swing, length)` and `unwarp(position, swing, length)`, positions in slots within
  `[0, length]`. The pair containing `p` starts at `2·⌊p/2⌋`; the formulas above apply to `p` minus that offset.
- Odd length: a pair is only swung when it is complete (`offset + 2 ≤ length`). The last slot of an odd pattern is
  the identity, so `warp(length) = length` always and the loop lasts exactly as long as without swing.
- `swing` outside `[0, 0.75]` (or NaN) is clamped by `warp`/`unwarp` themselves (NaN → 0): a bad value can never
  make `1 − d` reach 0 and the inverse divide by zero.
- `SWING_MAX = 0.75` lives in `core/timing.ts`.
- Scheduler: the cursor stays in **unwarped** slot space, so the window bookkeeping (half-open windows shifted by
  −ε, exactly-once, loop wrap, shrink = `cursor mod length`) is unchanged. Only the conversion between slots and
  audio time goes through the warp:
  - window end: `unwarp(min(warp(cursor) + (horizon − cursorTime)/sps, length))`;
  - event time: `cursorTime + (warp(leaf.start) − warp(cursor))·sps`;
  - loop wrap: `cursorTime += (length − warp(cursor))·sps`;
  - late tick: `cursor = unwarp((warp(cursor) + late/sps) mod length)`.
- `positionAt(time)` computes the warped position the same way the scheduler does and returns its `unwarp`, so
  `leafAt` highlights the square whose (swung) note is sounding.
- Changing swing mid-play: like a tempo change, it applies from the cursor (≤ 100 ms ahead). The cursor keeps its
  unwarped position and audio time; events already handed to the engine are not moved; later events use the new
  warp relative to the cursor. The pair in progress may therefore be a little longer or shorter once — no note is
  skipped or doubled.
- `AppState.setSwing(v)` takes a fraction, clamps it to `[0, 0.75]`, rounds it to whole percent (the slider's grid),
  ignores NaN, and keeps the same song object when the value doesn't change (missing = 0).
- `parseSong`: a missing `swing` stays missing; a finite number in `[0, 0.75]` is kept; anything else rejects the
  song.
- Transport: `<input type="range" min=0 max=75 step=1>` labelled "Swing", its value shown next to it as `NN %`
  (also as `aria-valuetext`). It applies on `input` (live while dragging).

## Acceptance criteria

- [x] `Song.swing?: number` in [0, 0.75] (missing = 0). `AppState.setSwing(v)` clamps (and rounds to 1 %) the value.
- [x] `warp`/`unwarp` are pure, monotonic, inverses (up to float error), and the identity at swing 0 (property-style unit tests,
      including for tuplet positions inside a slot).
- [x] The scheduler schedules each note at `warp(leaf.start)`. Loop wrap, exactly-once scheduling and live edits all
      keep working (the existing scheduler tests run unchanged at swing 0 and gain swing variants).
- [x] With an odd number of slots, the last slot stays unswung, so the loop length in time never changes.
- [x] `positionAt` uses `unwarp`, so the playhead highlights the right square with swing on.
- [x] Transport: a swing slider (0–75 %, step 1) with its value shown, ≥ 44 px touch target, fits 360 px.
- [x] Saved and restored with autosave; `parseSong` validates the range.
- [x] Changing swing mid-play applies from the cursor: scheduled events stay put, no note is skipped or doubled.
- [x] e2e (`?fake-audio`): with swing on, the gaps between notes alternate long/short; at 0 they are equal.

## Notes

- The scheduler change is small because the cursor stays unwarped: `from = warp(cursor)` replaces `cursor` wherever
  slots turn into seconds, and the window end is `unwarp`ed back. `unwarp(length) = length` for both parities, so a
  wrap still sets the window end to exactly `length`.
- A reviewer subagent fuzzed the scheduler against the ground truth (400 random nested-tuplet patterns, random swing,
  tempo, lookahead and tick steps; 300 runs of random live edits, swing/tempo changes, shrinks and late ticks):
  every note once, in order, at its warped time, never in the past. No high/medium findings.
- `unwarp(warp(p))` can come back ~1e-14 slots low. In theory a window end could then land a hair before the cursor
  if a tick came ~1e-14 slots after the previous one; a probe with ticks 1e-15 s apart found no double note, and
  `AudioContext.currentTime` moves in 128-frame steps, so no guard was added.
- After a swing (or pattern) change, the playhead for notes already queued (≤ 100 ms) is computed with the new warp
  and can disagree briefly with what is heard, as with tempo changes.
- `parseSong` accepts any swing in range (e.g. 0.333); the slider shows it rounded and `setSwing` snaps it to whole
  percent on the next change.
- Space toggles play/stop while the slider is focused (a range input has no use for Space).

## Out of scope

A swing grid independent of the slot value (the user chose pairs of slots).
