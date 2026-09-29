# 05 — Scheduler

Status: in progress
Branch: feat/04-05-timeline-scheduler

## Behaviour

A Web Audio lookahead scheduler ("A Tale of Two Clocks", PLAN §2.4) plays the first track of the song in a loop.
Every tick it reads the song fresh, so edits made while playing (move, mute, delete, group, tempo) are heard on
the next event that has not been scheduled yet. The playhead follows **position in time** (tape semantics), not
a square.

- `AudioEngine`: `now()`, `play(soundId, when)`, `stopAll()`. `FakeEngine` is a test double with a manual clock
  (`time`, `advance(s)`), a `log` of `{ soundId, when }` and a `stopAllCount`.
- `createScheduler({ engine, getSong, timer?, lookahead = 0.1, interval = 0.025, startOffset = 0.05 })` returns
  `{ start(), stop(), tick(), isPlaying, positionAt(time) }`.
- State: `cursor` (slot position already scheduled up to) and `cursorTime` (audio time matching `cursor`).
- `tick()`: read the song, `buildTimeline` (memoized by track identity), `cursor %= length`, then walk from
  `cursor` to the horizon `now + lookahead`, crossing loop ends, calling `engine.play` for every audible leaf with
  `start ∈ [cursor − ε, windowEnd − ε)` (ε = 1e-9 slots). Consecutive windows therefore partition the loop:
  every event is scheduled exactly once, whatever the tick timing.
- `positionAt(time)`: the slot position heard at audio `time`, in `[0, length)`; `null` when stopped or the
  pattern is empty or the tempo is invalid.

## Acceptance criteria

- [ ] `start()` schedules the first leaf at `now + startOffset`, sets `isPlaying`, and installs a timer with
      `interval` (ms) whose callback ticks; a second `start()` while playing does nothing.
- [ ] Events are scheduled at `cursorTime + (start − cursor) × secondsPerSlot` and only within the lookahead.
- [ ] Silent and muted squares are never played.
- [ ] Loop wrap: events after the loop end are scheduled at the right times across several loops, also when one
      tick's window spans several loops.
- [ ] Exactly once: the log is the same (same events, same order, times within 1e-9) whatever the tick step,
      including patterns with thirds whose window boundaries land within float error of a leaf start.
- [ ] The song is read on every tick; `buildTimeline` runs once per distinct track object.
- [ ] Shrink: when the pattern shrinks under the cursor, playback continues at `cursor mod newLength`.
- [ ] Grow: when squares are appended, they play in the current loop if the cursor has not passed them.
- [ ] Empty pattern: nothing is scheduled, `tick()` terminates, and when squares are added the first one plays at
      the last scheduled horizon (never in the past).
- [ ] Tempo change: events after the cursor use the new tempo; events already scheduled are not moved.
- [ ] Live edits (tape semantics): playing `[A, B, C, D]`, after B is scheduled, swapping C and D is heard as D
      then C; muting the next square silences it; unmuting it before it is scheduled plays it.
- [ ] `stop()` calls `engine.stopAll()`, clears the timer, sets `isPlaying` false; `tick()` after stop schedules
      nothing; `start()` after `stop()` restarts from slot 0.
- [ ] Late tick (e.g. a throttled background tab): events whose time has already passed are dropped, not played
      in a burst; the position keeps following time.
- [ ] Guard: an invalid tempo (bpm 0) schedules nothing and does not throw; a tick never loops more than a fixed
      number of times.
- [ ] `positionAt(time)` returns the slot position at `time` (wrapping at the loop end), and `null` when stopped.

## Edge cases

- Thirds: `1/3` is not exact, so a window may end a hair before or after a leaf start. The `− ε` on both window
  bounds assigns such a leaf to exactly one window.
- Shrinking can make the cursor jump back (`cursor mod newLength`); a leaf is then heard again, as a tape would.
- Events inside the current lookahead (≤ 100 ms) are already handed to the engine and are not retracted.

## Out of scope

- The real `WebAudioEngine` and kit (feature 06), UI playhead rendering (07).
- Multiple tracks: only `song.tracks[0]` is scheduled (each track would need its own cursor).
- Swing, per-square volume.

## Files

`src/audio/engine.ts`, `src/audio/engine.test.ts`, `src/audio/scheduler.ts`, `src/audio/scheduler.test.ts`.

## Notes (added during review/doc step)
