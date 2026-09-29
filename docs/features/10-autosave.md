# 10 — Autosave

Status: done
Branch: feat/10-autosave

## Behaviour

The pattern, tempo, slot value and recorded sounds survive a reload. Saving happens automatically, with no button.

## Acceptance criteria

- [x] Storage module (`src/storage/db.ts`, via `idb-keyval`): `saveSong(song)`, `loadSong()`,
      `saveRecording(sound, blob)`, `loadRecordings()` → `{ sound, blob }[]`, `deleteRecording(id)`. Keys: `song`,
      `recording:<id>`.
- [x] The saved song carries `version: 1`. `loadSong` validates what it reads: the structure, known node kinds,
      unique ids, bpm range and slot value. Invalid or unknown data → `null` (the app falls back to the default
      song); a failed read rejects (the app then runs without saving). Loaded tracks are passed through `normalize`.
- [x] Autosave: 500 ms after the last change to `app.song` (debounced). No write when nothing changed (the ops keep
      object identity, so compare references). Pending changes are flushed on `pagehide` / `visibilitychange: hidden`.
- [x] A recording is saved when it is created and deleted from storage when its sound is deleted.
- [x] On startup: load the recordings (decode, load into the engine, add to `app.sounds`), then the song. Squares
      whose sound is missing (e.g. a recording that failed to decode) stay in place but render as silent.
- [x] IndexedDB unavailable (private mode, blocked): the app works without saving; no errors are thrown at the user.
- [x] Unit tests with `fake-indexeddb`. e2e: add a square, change BPM, reload → both are still there.

## Details (refined before coding, updated after review)

- **Storage** (`src/storage/db.ts`): `createDb(store, clock?)` wraps an `idb-keyval` store and returns the five
  functions of the acceptance criteria. `openDb()` probes IndexedDB once (a read of `song`, 2 s timeout) and returns
  `null` when it is missing, blocked (even reading `window.indexedDB` can throw), throws or hangs: the app then runs
  without saving.
- **What is stored**: `song` = the plain `Song` object (structured clone). `recording:<id>` = a `RecordingRecord`
  (`sound`, `type`, `data: ArrayBuffer`, `savedAt`): bytes rather than a `Blob`, because older Safari versions
  failed to store Blobs in IndexedDB. `loadRecordings` rebuilds the Blobs and returns the recordings in the order
  they were saved, so the palette keeps its order. A record whose key does not match its sound id is skipped, and
  each id loads once.
- **Validation** (`src/storage/validate.ts`, pure): `parseSong(data)` returns a `Song` or `null`. It accepts only
  version 1, an integer bpm in 30..300, a slot value of 4/8/16, at least one track, well-formed squares and groups
  (span 1), ids unique across the song, no array holes (structured clone keeps them), nesting up to 32 groups and
  at most 10 000 nodes. It rebuilds clean objects (unknown fields are dropped) and normalizes every track.
  `parseRecordingRecord(data)` checks a stored recording (`source: 'recording'`, id starting with `rec-`, string
  name, color and type, `ArrayBuffer` data, finite `savedAt`).
- **Reads**: `loadSong` returns `null` for "no song" or invalid data, but **rejects** when the read itself fails.
  `main.ts` then runs without saving, so the default song can never overwrite a song it could not read.
- **Autosave** (`src/storage/autosave.ts`): `createAutosave({ save, saved, delayMs = 500, timer })` returns
  `update(song)` and `flush()`. `saved` is the song on screen at startup, so nothing is written before the first
  edit. `update` restarts the 500 ms timer when the song object differs from the last saved (or pending) one;
  `flush` writes a pending song at once. A failed write is not shown to the user; the song stays pending and is
  retried by the next change or flush. `flushOnHide(autosave)` flushes on `pagehide` and when the page becomes
  hidden.
- **Change detection**: `watchSong(app, callback)` in `state.svelte.ts` (an `$effect.root`, callback untracked)
  calls back with every new `app.song`. `setBpm`/`setSlotValue` keep the song object when the value does not
  change, like the ops.
- **Recordings**: `createRecordings` takes an optional `store`. A new recording is saved after it is added (not
  awaited: the sound is usable at once), a deleted one is deleted from storage. Writes are chained per id, so a
  delete pressed during the save lands after it. Storage failures are swallowed: the sound still works for this
  session. `restoreRecordings(stored, { decode, engine })` decodes and loads each stored recording and returns the
  sounds that decoded (a failed or throwing decode is skipped).
- **Startup** (`main.ts`): engine, then `openDb()`, then recordings (decode and load), then the song (or the default
  song), then `AppState` (kit plus restored recordings), autosave, transport and mount. Mounting after loading means
  no flash of the default pattern and no edit lost to a late load. If anything on that path throws, the app starts
  again on the default song without saving (rather than staying blank).
- **Missing sounds**: a square whose sound id is not in `app.sounds` (a recording that failed to decode) keeps its
  `soundId` (it comes back if the recording loads next time) but renders as silent: hatched, labelled "silent".
  The engine ignores unknown ids, so it plays nothing.
- **e2e**: add a square and change the BPM, reload: both are there; nothing is written before an edit; an invalid
  stored song falls back to the default and is kept until an edit; no IndexedDB, or a throwing `indexedDB` getter,
  still starts without errors; hiding the page writes at once (all 4 projects). On Chromium with the fake mic:
  record, put it on a square, reload: the recording is in the palette and on the square; delete it, reload: gone.

## Edge cases

- Two tabs open: last write wins (acceptable for v1).
- Stored songs from a future version → treated as invalid (not overwritten until the user edits).

## Notes (added during review/doc step)

- **APIs.** `storage/db.ts`: `createDb`, `openDb({ store?, timeoutMs? })`, types `Db`, `StoredRecording`.
  `storage/validate.ts`: `parseSong`, `parseRecordingRecord`, `MAX_DEPTH`, `MAX_NODES`, type `RecordingRecord`.
  `storage/autosave.ts`: `createAutosave`, `flushOnHide`. `state.svelte.ts`: `watchSong(app, callback)`, and the
  `AppState` constructor takes optional `sounds`. `audio/recordings.ts`: `RecordingStore`, the `store` option,
  `restoreRecordings`. `audio/` does not import `storage/`; `main.ts` wires them.
- **Tests.** Storage tests run in the node environment with `fake-indexeddb/auto` (a devDependency), one database
  per test. `tests/e2e/storage.ts` reads and writes the app's IndexedDB from the page; it refuses to run before the
  app has created its database (creating it first, without the object store, would break saving on that origin).
- **Review** (reviewer subagent): no high findings; 4 medium, all fixed with regression tests: array holes passed
  validation and crashed every reload; a throw during startup (blocked storage getter, sync-throwing decode) left a
  blank page; a failed write was treated as saved and never retried; a failed song read looked like "no song", so
  the first edit would overwrite the real song. Lows fixed: a delete racing the recording's save, key/id mismatch and
  duplicates, depth/size caps, `add` no longer waits for the write, an e2e for the flush on hide, the e2e helper
  guard.
- **Known limits.** Two tabs: last write wins. If the 2 s probe times out on a slow first open, that session runs
  without saving and does not say so. A stored recording that never decodes stays in storage (it is not in the
  palette, so it cannot be deleted). Loading after the probe has no timeout: a decode that never settles would keep
  the page blank. None of these has been seen in practice.
- **To check on a real device.** iOS Safari: edits survive closing the tab from the app switcher (flush on
  `visibilitychange`), and recordings survive a reload (stored as bytes). Private browsing on iOS/Firefox: the app
  starts and works without saving.

## Out of scope

Multiple saved patterns, export/import, and cloud sync.

## Files

`src/storage/db.ts` (+test), `src/storage/validate.ts` (+test), `src/storage/autosave.ts` (+test), `src/main.ts`,
`src/state.svelte.ts` (`watchSong`, `sounds` in the constructor, no-op setters), `src/audio/recordings.ts` (store,
`restoreRecordings`), `src/ui/NodeView.svelte` (missing sound = silent), `tests/e2e/autosave.spec.ts`,
`tests/e2e/record.spec.ts` (recording survives a reload).
