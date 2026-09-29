# 06 — Audio engine, built-in kit, transport

Status: planned
Branch: feat/06-audio-transport

## Behaviour

The app makes sound. A `WebAudioEngine` implements the `AudioEngine` interface (from 05) on a real
`AudioContext`. A built-in kit is synthesized into `AudioBuffer`s at startup. The transport bar lets the user
start/stop the loop and change BPM and slot value, and changes are heard immediately while playing.

## Acceptance criteria

- [ ] `WebAudioEngine.play(soundId, when)` creates an `AudioBufferSourceNode` for the sound's buffer and starts it at `when`. Unknown sound ids are ignored.
- [ ] `stopAll()` stops every source that is scheduled or playing, and forgets them once they end.
- [ ] `unlock()` resumes a suspended context. The app calls it on the first `pointerdown`/`keydown` (iOS needs this).
- [ ] The kit has 8 sounds: kick, snare, hat, clap, rim, tone-low, tone-mid, tone-high. Each has an id, a name and a color. Each renders into a non-silent mono buffer ≤ 1 s. Rendering uses `OfflineAudioContext`, and the render functions are unit-testable with a fake context.
- [ ] Transport: Play/Stop toggle button (`aria-pressed`), BPM input (30–300, clamped), slot value selector (1/4, 1/8, 1/16).
- [ ] Changing BPM or slot value while playing takes effect from the next scheduled event (the scheduler reads the song on every tick).
- [ ] `?fake-audio` URL param swaps in `FakeEngine` and exposes `window.__seqTest = { engine, state }` for e2e.
- [ ] e2e: with `?fake-audio`, pressing Play schedules the kit sounds of the default pattern in order.

## Edge cases

- Play pressed before the kit finished rendering → start once it's ready (or disable Play until ready).
- Space bar toggles play/stop on desktop (not while typing in the BPM input).

## Out of scope

Per-sound volume, master volume/limiter (maybe later), recording (09).

## Files

`src/audio/engine.ts` (add WebAudioEngine), `src/audio/kit.ts`, `src/state.svelte.ts`, `src/ui/Transport.svelte`, `src/ui/App.svelte`, `tests/e2e/transport.spec.ts`.
