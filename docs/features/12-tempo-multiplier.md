# 12 — Half / double tempo

Status: in progress
Branch: feat/12-tempo-multiplier

## Behaviour

Next to BPM, a ½× / 1× / 2× switch plays the pattern at half or double speed without changing the BPM number, so you
can flip back and forth. While playing, the switch applies at once (from the next scheduled note, ≤ 100 ms).

## Acceptance criteria

- [ ] `Song.tempoFactor?: 0.5 | 1 | 2` (missing = 1, so older saves load unchanged). `AppState.setTempoFactor(f)`
      keeps the same song object when the value doesn't change.
- [ ] `secondsPerSlot(bpm, slotValue, factor = 1)` divides by the factor: 2× halves the slot duration.
- [ ] The scheduler uses the factor; changing it mid-play keeps the loop position (tempo applies from the cursor, as
      for BPM changes).
- [ ] Transport: a 3-way segmented control (`role="radiogroup"`, label "Speed"), each option ≥ 44 px, fits 360 px.
- [ ] Autosave stores the factor; `parseSong` accepts 0.5, 1 and 2, defaults a missing value to 1, and rejects any
      other value.
- [ ] e2e (`?fake-audio`): at 2× the gap between scheduled notes is half the gap at 1×.

## Out of scope

Snapping the switch to the next loop (possible later: the scheduler knows where the loop wraps).
