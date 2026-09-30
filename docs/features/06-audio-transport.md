# 06 — Audio engine, built-in kit, transport

Status: done
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

- [x] `WebAudioEngine.play(soundId, when)` creates an `AudioBufferSourceNode` for the sound's buffer, connects it to
      a master gain (0.8, headroom against clipping) and starts it at `when`. Unknown sound ids are ignored.
- [x] `stopAll()` stops every source that is scheduled or playing; sources are forgotten once they end.
- [x] `unlock()` resumes a suspended context. The app calls it on the first `pointerdown`/`pointerup`/`keydown`
      until the context runs (iOS only unlocks on `pointerup`/`touchend` for touch), and `play()` awaits it before
      starting the scheduler.
- [x] The kit has 8 sounds: kick, snare, hat, clap, rim, tone-low, tone-mid, tone-high (ids, names and colors in
      `sounds.ts`). Each renders into a non-silent mono buffer ≤ 1 s with peak ≤ 1 that ends at silence (no click).
      Rendering is deterministic and unit-tested without Web Audio.
- [x] Transport: Play/Stop toggle button (`aria-pressed`, accessible name "Play" / "Stop"), BPM input (30–300,
      clamped on commit — change/blur/Enter — never while typing; an empty or invalid entry reverts), slot value
      selector (1/4, 1/8, 1/16). Touch targets ≥ 44 px; fits a 360 px wide screen.
- [x] Changing BPM or slot value while playing takes effect from the next scheduled event (the scheduler reads the
      song on every tick).
- [x] Playhead: while playing, a `requestAnimationFrame` loop sets
      `app.playheadId = leafAt(timeline, scheduler.positionAt(engine.now()))?.nodeId ?? null`. It stops and resets to
      `null` on stop. `app.playing` mirrors the transport (it turns true as soon as Play is pressed, even while the
      context is still resuming).
- [x] Space toggles play/stop, except while focus is in a text field, number input, select or contenteditable.
      On a focused button Space toggles play instead of pressing the button (so it toggles exactly once).
- [x] `?fake-audio` URL param swaps in a `FakeEngine` whose clock follows `performance.now()` (so the scheduler
      advances in a real browser) and exposes `window.__seqTest = { engine, app }` for e2e.
- [x] e2e (all 4 projects): with `?fake-audio`, pressing Play schedules the kit sounds of the default pattern in
      order at increasing times and sets a playhead; Stop clears `app.playing` and the playhead.

## Edge cases

- Play pressed before the kit is ready: cannot happen, the kit renders synchronously before the app mounts.
- Play then Stop while the context is still resuming: nothing starts when the resume completes.
- `resume()` outside an accepted gesture usually stays pending (browsers rarely reject): Play then shows "Stop" and
  starts as soon as a later gesture resumes the context. If it does reject, the scheduler starts anyway.
- Key repeat and modified Space (Ctrl/Cmd/Alt) are ignored.

## Notes from 05

- Resume the `AudioContext` **before** `scheduler.start()`: a suspended context's clock does not move.
- The scheduler only plays `song.tracks[0]` and reads the song fresh on every tick. (Since feature 17 it plays
  every track, and the playhead follows the track of the selected tab.)

## Out of scope

Per-sound volume, master volume/limiter (maybe later), BPM slider, output-latency compensation of the playhead,
recording (09).

## Files

`src/audio/engine.ts` (add `WebAudioEngine`, `RealtimeFakeEngine`, `unlockOnGesture`), `src/audio/kit.ts`,
`src/audio/transport.ts`, `src/ui/Transport.svelte`, `src/ui/App.svelte`, `src/main.ts`,
`tests/e2e/transport.spec.ts` (+ colocated tests).

## Notes (added during review/doc step)

- **APIs.** `engine.ts`: `WebAudioEngine` (`context`, `load(id, buffer)`, `unlock()`, `now/play/stopAll`),
  `RealtimeFakeEngine` (a `FakeEngine` whose `now()` follows `performance.now()`), `unlockOnGesture(engine, target?)`.
  `kit.ts`: `renderSound(id, sampleRate)`, `renderKit(context)`. `transport.ts`: `createTransport(options)` →
  `{ play, stop, toggle }`, plus the `TransportState` and `FrameLoop` interfaces.
- **App shell.** `App.svelte` takes an optional `transport` prop and renders the bar only when given one, so the
  existing App component test (and any later one) renders without audio. `main.ts` always passes it.
- **Space** is handled by a `svelte:window` keydown listener in `Transport.svelte`. It calls `preventDefault()`, so
  on a focused button Space toggles play and does not press the button (e2e checks this on all 4 browsers). Keyboard
  users press buttons with Enter. Other components must not also bind Space.
- **Kit.** Samples are made in JS (seeded mulberry32 noise, RBJ biquads, exponential envelopes), with a 10 ms fade at
  the end, then normalized per sound (kick 0.95 … tones 0.5) and sent through a 0.8 master gain. Filter cutoffs are
  clamped below Nyquist: at 8 kHz (a Bluetooth headset in call mode) the 7 kHz hat filter was unstable and gave NaN.
- **Unlock.** `unlockOnGesture` listens to `pointerdown`/`pointerup`/`keydown` (capture) until `resume()` leaves the
  context `running`, because iOS only counts `pointerup` as a gesture for touch. On iOS 16.4+ `main.ts` also sets
  `navigator.audioSession.type = 'playback'`, so the silent switch does not mute the sequencer.
- **Safari select.** WebKit ignores `min-height` on a natively styled `<select>` (23 px tall). The select uses
  `appearance: none` with an SVG arrow; an e2e test checks that all controls are ≥ 44 px and fit in 360 px.
- **Known limits.** The playhead uses `context.currentTime` and ignores `outputLatency`, so it can run a little
  early on Bluetooth output. For up to 100 ms after a tempo change, `positionAt` applies the new tempo to events
  already scheduled, so the playhead can jump briefly. This is cosmetic and comes from 05.
- **Verified by hand in Playwright** (not committed): on the real engine in Chromium and WebKit, the context is
  suspended until Play, then runs and `AudioBufferSourceNode.start` is called for the pattern. The sound itself was
  not listened to.
