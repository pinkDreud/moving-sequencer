# 09 — Mic recording

Status: in progress
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

## Details (refined before coding)

- **Processing** (`sampleOps.ts`, pure): mono = mean of the channels; trim before the first sample with
  |x| ≥ -40 dBFS (0.01), never more than 1 s and never down to an empty buffer; peak-normalize to -1 dBFS with the
  gain capped at +30 dB (a silent recording stays silent); then a 10 ms linear fade-out, because the recording
  stops at an arbitrary point and the cut would click.
- **Mic capture** (`recorder.ts`): `getUserMedia({ audio })` with echo cancellation, noise suppression and auto gain
  off (we record instruments, not calls). `MediaRecorder` with the browser's default type (webm/opus in Chrome,
  mp4/aac in Safari). On stop (by the user or after 4 s) the mic tracks are stopped so the browser's mic indicator
  goes off. On iOS 16.4+ the audio session is switched to `play-and-record` for the recording and back to
  `playback` afterwards (06 sets `playback`, which does not allow capture).
- **Errors** → inline message (`role="status"`), cleared at the next Record press:
  `NotAllowedError`/`SecurityError` → "Microphone permission denied"; `NotFoundError`/`OverconstrainedError` →
  "No microphone found"; anything else → "Could not start the microphone"; a recording that cannot be decoded
  (e.g. stopped at once, empty) → "Could not read the recording".
- **Availability**: not a secure context → disabled, "Needs HTTPS"; secure but no `mediaDevices.getUserMedia` or
  no `MediaRecorder` → disabled, "Recording not supported in this browser".
- **Record button states**: idle "Record"; waiting for permission: disabled; recording: "Stop" + elapsed seconds
  (accessible name "Stop recording", so it never clashes with the transport's "Stop"); decoding: disabled.
- **Sound**: id `rec-<8 random chars>` (no kit id starts with `rec-`); name `Rec N` with N = 1 + the highest N among
  existing recordings (numbers are not reused while a higher one exists); colors cycle through a recording palette
  distinct from the kit.
- **Delete**: a recording's palette entry is the sound button plus a × button (`aria-label="Delete Rec 1"`, ≥ 44 px).
  The first press arms it (it turns into "Delete?", `aria-label="Confirm delete Rec 1"`); the second deletes. A
  press anywhere else, or blur, disarms. Deleting clears the sound from every square of every track (`clearSound`
  op: `soundId: null`, `muted: false`, same track back when no square used it), removes the sound from
  `app.sounds` and unloads its buffer from the engine.
- **Where the logic lives**: `sampleOps.ts` (pure), `recorder.ts` (`micAvailability`, `startRecording` with injected
  `getUserMedia`/recorder factory/timer/audio session, `decodeRecording` with an injected context),
  `recordings.ts` (`createRecordings`: blob → decoded buffer → `engine.load` → `state.addSound`; `remove`),
  `sounds.ts` (`newRecordingSound`), `ui/recordControl.svelte.ts` (`RecordControl`: button state, elapsed time,
  messages; unit-tested with fakes), `AppState.addSound/removeSound`.
- **`?fake-audio`**: `FakeEngine` gets `load/unload` and keeps the loaded buffers (`engine.loaded`), so the e2e can
  check the decoded, normalized buffer. Decoding uses an `OfflineAudioContext`, so the real decode path runs.
- **e2e**: the fake-media flags are set on the `chromium` project only (`launchOptions.args`); the record test is
  skipped on the other projects. Denied permission (stubbed `getUserMedia`) and the Record button size at 360 px
  run on all projects.

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
