# 12 — Half / double tempo

Status: done
Branch: feat/12-tempo-multiplier

## Behaviour

Next to BPM, a ½× / 1× / 2× switch plays the pattern at half or double speed without changing the BPM number, so you
can flip back and forth. While playing, the switch applies at once (from the next scheduled note, ≤ 100 ms).

## Acceptance criteria

- [x] `Song.tempoFactor?: 0.5 | 1 | 2` (missing = 1, so older saves load unchanged). `AppState.setTempoFactor(f)`
      keeps the same song object when the value doesn't change.
- [x] `secondsPerSlot(bpm, slotValue, factor = 1)` divides by the factor: 2× halves the slot duration.
- [x] The scheduler uses the factor; changing it mid-play keeps the loop position (tempo applies from the cursor, as
      for BPM changes).
- [x] Transport: a 3-way segmented control (`role="radiogroup"`, label "Speed"), each option ≥ 44 px, fits 360 px.
- [x] Autosave stores the factor; `parseSong` accepts 0.5, 1 and 2, defaults a missing value to 1, and rejects any
      other value.
- [x] e2e (`?fake-audio`): at 2× the gap between scheduled notes is half the gap at 1×.

## Notes

- A tempo change applies from the point the scheduler has already queued up to (≤ 100 ms ahead), like BPM changes.
  A test pins this down (`c@0.475`, not the naive `0.425`).
- `parseSong` keeps a missing `tempoFactor` missing (it means 1×), so a save made before this feature round-trips
  unchanged.
- The control uses real radio inputs (arrow keys and screen readers work) drawn as a segmented bar.

## Out of scope

Snapping the switch to the next loop (possible later: the scheduler knows where the loop wraps).
