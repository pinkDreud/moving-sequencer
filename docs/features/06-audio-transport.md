# 06 — Audio engine, built-in kit, transport

Status: in progress
Branch: feat/06-audio-transport

## Behaviour

The app makes sound. A `WebAudioEngine` implements the `AudioEngine` interface (from 05) on a real
`AudioContext`. A built-in kit is synthesized into `AudioBuffer`s at startup. The transport bar lets the user
start/stop the loop and change BPM and slot value, and changes are heard immediately while playing.

- `src/audio/kit.ts`: `renderSound(id, sampleRate)` is a pure sample generator (seeded noise, so it is
  deterministic) returning a mono `Float32Array`; `renderKit(context)` copies every kit sound into a mono
  `AudioBuffer` created with `context.createBuffer`. Generating samples in JS instead of an `OfflineAudioContext`
  keeps rendering synchronous (≈ 150 k samples, a few ms) and testable in jsdom, which has no Web Audio.
- `src/audio/transport.ts`: `createTransport({ engine, state, unlock?, timer?, frames? })` owns the scheduler and
  the `requestAnimationFrame` playhead loop and exposes `play()`, `stop()`, `toggle()`. `state` is anything shaped
  like `{ song, playing, playheadId }` (the `AppState`), so `audio/` does not import `state.svelte.ts`.
- `src/ui/Transport.svelte`: the transport bar, rendered by `App.svelte` when it is given a `transport` prop.
- `src/main.ts` picks the engine (`WebAudioEngine` + kit, or a real-time `FakeEngine` with `?fake-audio`).

## Acceptance criteria

- [ ] `WebAudioEngine.play(soundId, when)` creates an `AudioBufferSourceNode` for the sound's buffer, connects it to
      a master gain (0.8, headroom against clipping) and starts it at `when`. Unknown sound ids are ignored.
- [ ] `stopAll()` stops every source that is scheduled or playing; sources are forgotten once they end.
- [ ] `unlock()` resumes a suspended context. The app calls it on the first `pointerdown`/`pointerup`/`keydown`
      until the context runs (iOS only unlocks on `pointerup`/`touchend` for touch), and `play()` awaits it before
      starting the scheduler.
- [ ] The kit has 8 sounds: kick, snare, hat, clap, rim, tone-low, tone-mid, tone-high (ids, names and colors in
      `sounds.ts`). Each renders into a non-silent mono buffer ≤ 1 s with peak ≤ 1 that ends at silence (no click).
      Rendering is deterministic and unit-tested without Web Audio.
- [ ] Transport: Play/Stop toggle button (`aria-pressed`, accessible name "Play" / "Stop"), BPM input (30–300,
      clamped on commit — change/blur/Enter — never while typing; an empty or invalid entry reverts), slot value
      selector (1/4, 1/8, 1/16). Touch targets ≥ 44 px; fits a 360 px wide screen.
- [ ] Changing BPM or slot value while playing takes effect from the next scheduled event (the scheduler reads the
      song on every tick).
- [ ] Playhead: while playing, a `requestAnimationFrame` loop sets
      `app.playheadId = leafAt(timeline, scheduler.positionAt(engine.now()))?.nodeId ?? null`. It stops and resets to
      `null` on stop. `app.playing` mirrors the transport (it turns true as soon as Play is pressed, even while the
      context is still resuming).
- [ ] Space toggles play/stop, except while focus is in a text field, number input, select or contenteditable.
      On a focused button Space toggles play instead of pressing the button (so it toggles exactly once).
- [ ] `?fake-audio` URL param swaps in a `FakeEngine` whose clock follows `performance.now()` (so the scheduler
      advances in a real browser) and exposes `window.__seqTest = { engine, app }` for e2e.
- [ ] e2e (all 4 projects): with `?fake-audio`, pressing Play schedules the kit sounds of the default pattern in
      order at increasing times and sets a playhead; Stop clears `app.playing` and the playhead.

## Edge cases

- Play pressed before the kit is ready: cannot happen, the kit renders synchronously before the app mounts.
- Play then Stop while the context is still resuming: nothing starts when the resume completes.
- A failed `resume()` does not block: the scheduler starts anyway and a later gesture may still unlock the context.
- Key repeat and modified Space (Ctrl/Cmd/Alt) are ignored.

## Notes from 05

- Resume the `AudioContext` **before** `scheduler.start()`: a suspended context's clock does not move.
- The scheduler only plays `song.tracks[0]` and reads the song fresh on every tick.

## Out of scope

Per-sound volume, master volume/limiter (maybe later), BPM slider, output-latency compensation of the playhead,
recording (09).

## Files

`src/audio/engine.ts` (add `WebAudioEngine`, `RealtimeFakeEngine`), `src/audio/kit.ts`, `src/audio/transport.ts`,
`src/ui/Transport.svelte`, `src/ui/App.svelte`, `src/main.ts`, `tests/e2e/transport.spec.ts` (+ colocated tests).
