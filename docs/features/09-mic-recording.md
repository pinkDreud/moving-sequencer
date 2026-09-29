# 09 — Mic recording

Status: planned
Branch: feat/09-mic-recording

## Behaviour

The user records a short sound with the device microphone. It becomes a new sound in the palette, next to the kit,
and can be put on squares like any other sound.

## Acceptance criteria

- [ ] A "Record" button sits at the end of the palette. The first press asks for mic permission, then records. The
      button turns into "Stop" and shows the elapsed time. Recording stops automatically after 4 s.
- [ ] On stop, the audio is decoded, mixed to mono, trimmed of leading silence (threshold about -40 dBFS, at most
      the first 1 s trimmed), and peak-normalized to -1 dBFS. It is then registered as a `Sound`:
      `{ id: 'rec-<random>', name: 'Rec N', color from a recording palette, source: 'recording' }`. The sound is
      appended to `app.sounds`, and its buffer is loaded into the engine.
- [ ] The trimming and normalizing are pure functions on `Float32Array`, unit-tested.
- [ ] A recording's palette entry has a small delete control (no browser dialogs). Deleting a recording turns every
      square that used it into a silent square (a pure op, unit-tested) and removes the sound.
- [ ] Permission denied, or no mic → a short inline message; the app keeps working.
- [ ] Mic unavailable (no `navigator.mediaDevices`, or not a secure context) → Record is disabled, with a hint
      ("Needs HTTPS").
- [ ] `npm run dev:https` serves over HTTPS on the LAN (`@vitejs/plugin-basic-ssl`), so recording can be tested on a
      phone. This is documented in the README.
- [ ] The recorder is unit-tested with injected fakes for `getUserMedia`/`MediaRecorder`. The e2e test runs on
      Chromium with a fake media device (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`):
      record → stop → a "Rec 1" palette entry exists → tapping it adds a square with that sound.

## Edge cases

- Recording while playing is allowed. The recorded sound becomes playable as soon as it is loaded.
- Very quiet or empty recordings: normalizing never amplifies more than +30 dB, and an all-silent recording still
  becomes a (silent) sound.
- Kit sound ids are fixed; recording ids must never collide with them.

## Out of scope

Persisting recordings across reloads (feature 10), renaming, and editing/cropping UI.

## Files

`src/audio/recorder.ts` (+test), `src/audio/sampleOps.ts` (trim/normalize, +test), `src/core/ops.ts` (clear a sound
from the track), `src/state.svelte.ts` (add/remove sound), `src/ui/Palette.svelte` (+ Record control),
`src/main.ts` (wiring), `vite.config.ts` / `package.json` (`dev:https`), `tests/e2e/record.spec.ts`.
