# 10 — Autosave

Status: planned
Branch: feat/10-autosave

## Behaviour

The pattern, tempo, slot value and recorded sounds survive a reload. Saving happens automatically, with no button.

## Acceptance criteria

- [ ] Storage module (`src/storage/db.ts`, via `idb-keyval`): `saveSong(song)`, `loadSong()`, `saveRecording(sound,
blob)`, `loadRecordings()` → `{ sound, blob }[]`, `deleteRecording(id)`. Keys: `song`, `recording:<id>`.
- [ ] The saved song carries `version: 1`. `loadSong` validates what it reads: the structure, known node kinds,
      unique ids, bpm range and slot value. Invalid or unknown data → `null` (the app falls back to the default
      song). Loaded tracks are passed through `normalize`.
- [ ] Autosave: 500 ms after the last change to `app.song` (debounced). No write when nothing changed (the ops keep
      object identity, so compare references). Pending changes are flushed on `pagehide` / `visibilitychange: hidden`.
- [ ] A recording is saved when it is created and deleted from storage when its sound is deleted.
- [ ] On startup: load the recordings (decode, load into the engine, add to `app.sounds`), then the song. Squares
      whose sound is missing (e.g. a recording that failed to decode) stay in place but render as silent.
- [ ] IndexedDB unavailable (private mode, blocked): the app works without saving; no errors are thrown at the user.
- [ ] Unit tests with `fake-indexeddb`. e2e: add a square, change BPM, reload → both are still there.

## Edge cases

- Two tabs open: last write wins (acceptable for v1).
- Stored songs from a future version → treated as invalid (not overwritten until the user edits).

## Out of scope

Multiple saved patterns, export/import, and cloud sync.

## Files

`src/storage/db.ts` (+test), `src/storage/validate.ts` (+test), `src/storage/autosave.ts` (+test), `src/main.ts`.
