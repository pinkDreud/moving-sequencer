# 09 — Mic recording

Status: done
Branch: feat/09-mic-recording

## Behaviour

The user records a short sound with the device microphone. It becomes a new sound in the palette, next to the kit,
and can be put on squares like any other sound.

## Acceptance criteria

- [x] A "Record" button sits at the end of the palette. The first press asks for mic permission, then records. The
      button turns into "Stop" and shows the elapsed time. Recording stops automatically after 4 s.
- [x] On stop, the audio is decoded, mixed to mono, trimmed of leading silence (threshold about -40 dBFS, at most
      the first 1 s trimmed), and peak-normalized to -1 dBFS. It is then registered as a `Sound`:
      `{ id: 'rec-<random>', name: 'Rec N', color from a recording palette, source: 'recording' }`. The sound is
      appended to `app.sounds`, and its buffer is loaded into the engine.
- [x] The trimming and normalizing are pure functions on `Float32Array`, unit-tested.
- [x] A recording's palette entry has a small delete control (no browser dialogs). Deleting a recording turns every
      square that used it into a silent square (a pure op, unit-tested) and removes the sound.
- [x] Permission denied, or no mic → a short inline message; the app keeps working.
- [x] Mic unavailable (no `navigator.mediaDevices`, or not a secure context) → Record is disabled, with a hint
      ("Needs HTTPS").
- [x] `npm run dev:https` serves over HTTPS on the LAN (`@vitejs/plugin-basic-ssl`), so recording can be tested on a
      phone. This is documented in the README.
- [x] The recorder is unit-tested with injected fakes for `getUserMedia`/`MediaRecorder`. The e2e test runs on
      Chromium with a fake media device (`--use-fake-device-for-media-stream --use-fake-ui-for-media-stream`):
      record → stop → a "Rec 1" palette entry exists → tapping it adds a square with that sound.

## Details (refined before coding)

- **Processing** (`sampleOps.ts`, pure): mono = mean of the channels; trim before the first sample with
  |x| ≥ -40 dBFS (0.01), never more than 1 s and never down to an empty buffer; peak-normalize to -1 dBFS with the
  gain capped at +30 dB (a silent recording stays silent); then a 2 ms fade-in and a 10 ms fade-out, because the
  trim cuts right at the onset and the recording stops at an arbitrary point: both cuts would click.
- **Mic capture** (`recorder.ts`): `getUserMedia({ audio })` with echo cancellation, noise suppression and auto gain
  off (we record instruments, not calls). `MediaRecorder` with the browser's default type (webm/opus in Chrome,
  mp4/aac in Safari). On stop (by the user or after 4 s) the mic tracks are stopped so the browser's mic indicator
  goes off. On iOS 16.4+ the audio session is switched to `play-and-record` for the recording and back to
  `playback` afterwards (06 sets `playback`, which does not allow capture).
- **Errors** → inline message (`role="status"`), cleared at the next Record press:
  `NotAllowedError`/`SecurityError` → "Microphone permission denied"; `NotFoundError`/`OverconstrainedError` →
  "No microphone found"; anything else → "Could not start the microphone"; a recording that cannot be decoded
  (e.g. stopped at once, empty) → "Could not read the recording"; the recorder failing midway → "Recording failed".
- **Availability**: not a secure context → disabled, "Needs HTTPS"; secure but no `mediaDevices.getUserMedia` or
  no `MediaRecorder` → disabled, "Recording not supported in this browser".
- **Record button states**: idle "Record"; waiting for the mic (permission prompt): "Cancel" (`aria-label="Cancel
recording"`), which returns to idle at once and closes the stream if it arrives later; recording: "Stop" + elapsed
  seconds (accessible name "Stop recording", so it never clashes with the transport's "Stop"); decoding: "Saving…",
  disabled.
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
  `sounds.ts` (`newRecordingSound`), `src/recordControl.svelte.ts` (`RecordControl`: button state, elapsed time,
  messages; state layer, unit-tested with fakes), `AppState.addSound/removeSound`.
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

## Notes (added during review/doc step)

- **APIs.** `audio/sampleOps.ts`: `dbToGain, mixToMono, trimLeadingSilence, normalizePeak, fadeIn, fadeOut,
processRecording`. `audio/recorder.ts`: `micAvailability(env)`, `startRecording(deps, maxSeconds?)` →
  `{ stop(), result }`, `MicError` (`reason: 'denied' | 'no-mic' | 'failed'`), `browserMic()`, `decodeRecording(blob,
context)`. `audio/recordings.ts`: `createRecordings({ state, engine, decode, newKey? })` → `{ add(blob), remove(id) }`.
  `audio/engine.ts`: `SoundLoader` (`load`/`unload`) on `WebAudioEngine` and `FakeEngine` (which keeps `loaded`).
  `audio/sounds.ts`: `RECORDING_COLORS`, `newRecordingSound(existing, key)`. `core/ops.ts`: `clearSound(track, id)`.
  `AppState`: `addSound(sound)`, `removeSound(id)`. `RecordControl` (`src/recordControl.svelte.ts`): `status`,
  `elapsed`, `message`, `hint`, `disabled`, `toggle()`, `remove(id)`. Palette/Editor/App take an optional
  `recording` prop; without it (component tests) there is no Record button and no delete buttons.
- **Palette layout.** Kit sounds, then Silent, then a sub-grid of wider cells (≥ 150 px) holding the recordings (sound
  button + ×) and Record last. Two-column cells in the main grid left holes; the sub-grid keeps the order readable.
- **Recording while playing** works; recordings are loaded into the engine before they appear in the palette.
- **`?fake-audio`** decodes with an `OfflineAudioContext`, so the e2e exercises the browser's real decoder and checks
  the stored buffer (mono, < 4 s, peak ≈ 0.891 = -1 dBFS) through `engine.loaded`.
- **e2e setup.** The `chromium` project launches with `--use-fake-device-for-media-stream
--use-fake-ui-for-media-stream` and `permissions: ['microphone']`; the two recording tests skip the other projects.
  On this Mac the very first fake-mic `getUserMedia` of a session once hung for several seconds (cold audio
  service); later runs (16 repeats) were stable.
- **dev:https.** `vite.config.ts` adds `@vitejs/plugin-basic-ssl` only in `--mode https`; `dev`, `build`,
  `preview` and the e2e stay plain HTTP.
- **Review** (reviewer subagent): no high findings; 4 medium, all fixed with regression tests: the live region was
  `display: none` while empty (may not be announced); Record could stay disabled forever on an unanswered permission
  prompt (now Cancel); a throwing or unconfirmed `MediaRecorder.stop()` could escape or hang (now fails cleanly, 2 s
  watchdog); the denied e2e needed a `MediaRecorder` stub for WebKit builds without it. Lows fixed: `RecordControl`
  moved from `ui/` to the state layer (it imported audio values), onset click (fade-in), focus after delete,
  Cancel/Saving labels, extra tests.
- **Known limits / to check on a real device.** iOS: the audio session switches to `play-and-record` for the
  recording and back to `playback`; whether playback keeps going through the speaker (not the earpiece) during and
  after a recording, and whether the AudioContext needs a new gesture afterwards, is not verified. If the user
  cancels and presses Record again before the first prompt settles, two `getUserMedia` calls overlap and the second
  one saves `play-and-record` as the session type to restore (rare; the next recording fixes it).

## Out of scope

Persisting recordings across reloads (feature 10), renaming, and editing/cropping UI.

## Files

`src/audio/recorder.ts` (+test), `src/audio/sampleOps.ts` (trim/normalize, +test), `src/core/ops.ts` (clear a sound
from the track), `src/state.svelte.ts` (add/remove sound), `src/ui/Palette.svelte` (+ Record control),
`src/main.ts` (wiring), `vite.config.ts` / `package.json` (`dev:https`), `tests/e2e/record.spec.ts`.
