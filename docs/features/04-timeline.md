# 04 — Timeline + timing

Status: done
Branch: feat/04-05-timeline-scheduler

## Behaviour

`buildTimeline(track)` flattens the node tree into a list of timed leaves, one per square, in slot units.
The scheduler (05) uses it to know when each sound plays; the UI (07) uses `leafAt` to highlight the square
under the playhead. `secondsPerSlot(bpm, slotValue)` converts slot units to seconds.

- `Leaf = { nodeId, soundId, audible, start, duration }`, `Timeline = { length, leaves }`.
- Top-level node i occupies `[i, i+1)`; `length` is the sum of the top-level spans (always 1 per node in v1).
- A group divides its interval evenly among its children, recursively.
- `audible = soundId !== null && !muted`. Silent and muted squares are still leaves (the playhead needs them).
- Leaves are in time order (depth-first document order) and tile `[0, length)` without gaps.
- `leafAt(timeline, position)` returns the leaf whose `[start, start + duration)` contains `position`.

## Acceptance criteria

- [x] Given an empty track, `buildTimeline` returns `{ length: 0, leaves: [] }`.
- [x] Given `[A, B, C]`, leaves start at 0, 1, 2 with duration 1 and `length` is 3.
- [x] Given `[A, (B C D), E]`, B starts at 1, C at 1 + 1/3, D at 1 + 2/3, each lasting 1/3; E starts at 2; `length` is 3.
- [x] Given a nested group `(X (Y Z))` in one slot, X lasts 1/2, Y and Z 1/4 each, starting at 0, 1/2, 3/4.
- [x] A silent square is a leaf with `soundId: null, audible: false`; a muted square is a leaf with its sound and `audible: false`.
- [x] Leaves carry the square's `nodeId`; groups produce no leaf of their own.
- [x] `buildTimeline` does not mutate the track.
- [x] `secondsPerSlot(120, 4)` = 0.5, `(120, 8)` = 0.25, `(120, 16)` = 0.125, `(60, 4)` = 1.
- [x] `leafAt` returns the leaf containing the position (start inclusive, end exclusive).
- [x] `leafAt` tolerates float error: a position a hair below a third-boundary (e.g. `1 + 1/3 - 1e-12`) still maps
      to the leaf starting there.
- [x] `leafAt` returns `undefined` for an empty timeline and for positions outside `[0, length)`.

## Edge cases

- Thirds are not exact in binary floating point; positions are compared with an epsilon of 1e-9 slots.
- A group with 0 children cannot exist (normalize removes it), but if one did, its slot would simply have no leaf.

## Out of scope

- Group span > 1 (the model fixes `span: 1`; the code already sums spans so it will work unchanged).
- Tempo validation: callers (transport UI) clamp BPM to 30–300.

## Files

`src/core/timeline.ts`, `src/core/timeline.test.ts`, `src/core/timing.ts`, `src/core/timing.test.ts`.

## Notes (added during review/doc step)

- Leaves are computed as `start + (i * duration) / n`, so thirds are only approximately exact. Every consumer
  compares slot positions with `EPSILON = 1e-9` (exported from `timeline.ts`, reused by the scheduler).
- `leafAt` scans from the end for the last leaf starting at or before `position + EPSILON`, then checks the end
  bound. A position a hair below a tuplet boundary maps to the next leaf, and a slot with no leaf returns
  `undefined` instead of the previous leaf.
- `length` already sums top-level spans (squares count 1), so group span > 1 needs no change here.
- `secondsPerSlot` does not validate `bpm`; the scheduler treats a non-finite or non-positive result as
  "schedule nothing".
