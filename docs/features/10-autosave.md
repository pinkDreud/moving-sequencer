# 10 — Autosave

Status: in progress
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

## Details (refined before coding)

- **Storage** (`src/storage/db.ts`): `createDb(store)` wraps an `idb-keyval` store and returns `{ saveSong, loadSong,
saveRecording, loadRecordings, deleteRecording }`; `openDb()` probes IndexedDB once (read of `song`, 2 s timeout)
  and returns `null` when it is missing, throws or hangs, so the app runs without saving.
- **What is stored**: `song` = the plain `Song` object (structured clone). `recording:<id>` =
  `{ sound, type, data: ArrayBuffer, savedAt }`: bytes rather than a `Blob`, because older Safari versions failed to
  store Blobs in IndexedDB, and a Blob cannot be cloned in every environment. `loadRecordings` rebuilds the Blob
  and returns the recordings in the order they were saved (`savedAt`), so the palette keeps its order.
- **Validation** (`src/storage/validate.ts`, pure): `parseSong(data)` → `Song | null`. It accepts only `version: 1`,
  an integer bpm in 30..300, a slot value of 4/8/16, at least one track, tracks `{ id: string, nodes: [] }`, squares
  `{ kind: 'square', id, soundId: string | null, muted: boolean }`, groups `{ kind: 'group', id, span: 1,
children: [] }`, and ids unique across the song. It rebuilds clean objects (unknown fields are dropped) and
  normalizes every track. `parseRecording(data)` → `{ sound, blob, savedAt } | null` checks the stored record
  (`source: 'recording'`, id starting with `rec-`, string name and color, `ArrayBuffer` data).
- **Autosave** (`src/storage/autosave.ts`): `createAutosave({ save, saved, delayMs = 500, timer })` →
  `{ update(song), flush() }`. `saved` is the song on screen at startup, so nothing is written until the first edit.
  `update` (re)starts the 500 ms timer when the song object differs from the last saved one; `flush` writes a
  pending song immediately. A failed write is swallowed (no error for the user). `flushOnHide(autosave, window,
document)` flushes on `pagehide` and on `visibilitychange` to `hidden`.
- **Change detection**: `watchSong(app, callback)` in `state.svelte.ts` (an `$effect.root`) calls back with every new
  `app.song`. `setBpm`/`setSlotValue` keep the song object when the value does not change, like the ops.
- **Recordings**: `createRecordings` takes an optional `store` (`saveRecording`/`deleteRecording`): a new recording is
  saved after it is added, a deleted one is deleted from storage. Storage failures are swallowed: the sound still
  works for this session. `restoreRecordings(entries, { decode, engine })` decodes and loads each stored recording
  and returns the sounds that decoded (a failed one is skipped).
- **Startup** (`main.ts`): engine → `openDb()` → recordings (decode, `engine.load`) → song (`loadSong() ??
defaultSong`) → `new AppState({ song, sounds: [...KIT, ...restored] })` → transport, autosave, mount. The UI is
  mounted after loading, so there is no flash of the default pattern and no edit can be lost to a late load.
- **Missing sounds**: a square whose sound id is not in `app.sounds` (a recording that failed to decode) keeps its
  `soundId` (it comes back if the recording loads next time) but renders as silent: hatched, `aria-label="silent"`.
  The engine ignores unknown ids, so it plays nothing.
- **e2e**: add a square and change the BPM, reload → both are there (all 4 projects). On Chromium with the fake mic:
  record, put it on a square, reload → the recording is still in the palette and on the square; delete it, reload →
  gone.

## Edge cases

- Two tabs open: last write wins (acceptable for v1).
- Stored songs from a future version → treated as invalid (not overwritten until the user edits).

## Out of scope

Multiple saved patterns, export/import, and cloud sync.

## Files

`src/storage/db.ts` (+test), `src/storage/validate.ts` (+test), `src/storage/autosave.ts` (+test), `src/main.ts`,
`src/state.svelte.ts` (`watchSong`, `sounds` in the constructor, no-op setters), `src/audio/recordings.ts` (store,
`restoreRecordings`), `src/ui/NodeView.svelte` (missing sound = silent), `tests/e2e/autosave.spec.ts`,
`tests/e2e/record.spec.ts` (recording survives a reload).
