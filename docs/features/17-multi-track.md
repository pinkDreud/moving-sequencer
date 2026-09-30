# 17 — Multiple tracks

Status: done (on the branch, not merged)
Branch: feat/17-multi-track (not merged: the user wants to try it before it goes to `main`, which deploys)

## Behaviour (user request, 2026-09-30)

A song has several tracks that **play together**. Each one is built in its own **tab**: only the track of the
selected tab is shown and edited, all of them are heard. The first track is the **master**. Every other track chooses
what it shares with the master:

- **Same slots** (`sync: 'slot'`, the default): one slot of the track lasts as long as one slot of the master. A track
  with a different number of slots loops on its own and drifts against the master (polymeter: 3 slots against 4 meet
  again every 12).
- **Same loop** (`sync: 'loop'`): the whole track lasts as long as the master's loop, whatever its number of slots
  (polyrhythm: 3 slots against 4 = 3:4). Its slots are stretched or squeezed to fit.

BPM, speed, swing and slot value stay global (they define the master's slot). The preparation area is shared by all
tabs, so a figure can be dragged into any track.

## Design

### Model

`Track.sync?: 'slot' | 'loop'` (`TrackSync`). Missing means `'slot'`, so songs saved before this feature load
unchanged. The master (`tracks[0]`) ignores its own `sync`.

### Scheduler

All tracks share the seconds per slot of the song.

- **Free-running tracks** (the master, and every `'slot'` track): each has its own cursor and runs the algorithm of
  05/13 with its own length. Swing pairs the track's own slots.
- **Loop-synced tracks** have no cursor: they are scheduled inside the master's windows. A leaf at track position `s`
  sounds at the master's swung position `m = warp(s) · masterLength / trackLength` (`warp` over the track's own
  slots), so the track is always aligned with the master's loop, also after live edits of either track.
- A loop-synced track whose master is empty has no loop to fit: it runs free, like a `'slot'` track.
- A free-running track that starts while others are already running (its first square was added, it was switched
  from loop to slot sync, the master was refilled) starts at `reference position mod length`, taken in swung slots,
  where the reference is the first running free track: it stays on the common slot grid. With no reference it starts at slot 0 at the last
  horizon, as the single track always did.
- `positionAt(time, trackIndex = 0)` gives the position in that track.

### State

- `app.activeTrack` (index, not saved; 0 at startup). `app.track` is the active track, so the strip, the palette,
  the selection actions and drag & drop edit the visible tab without knowing about tracks.
- `selectTrack(i)` clears the selection (its ids belong to the tab being left; prep ids go too).
- `addTrack()` appends an empty `'slot'` track and makes it active, up to `MAX_TRACKS = 8`.
- `removeTrack(i)` removes a track other than the master and keeps the same track active where possible.
- `setTrackSync(i, sync)` for `i > 0`.
- The transport shows the playhead of the active track.

### UI

`TrackTabs.svelte`, above the pattern strip: a tablist (`Master`, `Track 2`, `Track 3`, …) and an `Add track`
button. For a tab other than the master, a row under the tabs holds the `Sync` choice (radio group: `Same slots` /
`Same loop`) and `Remove track`, which asks for a second press (`Remove?`) because it cannot be undone.

## Acceptance criteria

- [x] `parseSong` accepts tracks with `sync` missing, `'slot'` or `'loop'`, keeps a missing one missing, and rejects
      anything else.
- [x] Two `'slot'` tracks of 4 and 3 slots: both play every slot at the master's slot duration, each looping at its
      own length.
- [x] A `'loop'` track of 3 slots over a 4-slot master: its notes land at 0, 4/3 and 8/3 master slots, every loop.
- [x] A `'loop'` track stays aligned with the master's loop start after the master or the track changes length
      mid-play; no note is doubled.
- [x] A `'loop'` track over an empty master plays at the slot duration.
- [x] A track that gets its first square mid-play starts on the slot grid of the running tracks.
- [x] Groups, mute and silent squares work in every track; swing pairs each track's own slots.
- [x] `positionAt(time, i)` follows track `i`; the playhead is shown on the active tab's squares.
- [x] Tabs: `Master` plus one per track; selecting a tab shows that track and clears the selection; palette taps,
      selection actions and drags edit the active track only.
- [x] `Add track` adds an empty track and switches to it; it is disabled at 8 tracks.
- [x] `Remove track` (second press) removes the active non-master track; the master has no remove and no sync.
- [x] The sync choice is saved and restored with autosave, like the tracks.
- [x] Removing a recording silences its squares in every track.
- [x] e2e (`?fake-audio`): a second track's sounds are scheduled together with the master's; with `Same loop`, 3
      slots span the master's loop.

## Edge cases

- The master is empty and other tracks are not: they play (free-running).
- All tracks empty: nothing plays, as before.
- Changing sync mid-play: to `'loop'` the track snaps to the master's loop from the next window; to `'slot'` it
  continues from `reference.cursor mod length`.
- Odd-length master with swing: its last slot is straight (13), so a `'slot'` track of another length may swing the
  other slot of a pair for a while. Accepted.

## Out of scope

Per-track volume, mute or solo · renaming or reordering tracks · showing several tracks at once · slot width
proportional to time on a loop-synced tab · a track with its own BPM or slot value.

## Files

`src/core/model.ts`, `src/audio/scheduler.ts`, `src/audio/transport.ts`, `src/storage/validate.ts`,
`src/state.svelte.ts`, `src/ui/TrackTabs.svelte`, `src/ui/Editor.svelte`, `tests/e2e/tracks.spec.ts`.

## Notes (added during review/doc step)

- The scheduler keeps one `Voice` (cursor + audio time) per free-running track, by track id, and one `frontier`
  (the last horizon). `advance` is the single-track loop of 05/13 unchanged; the master reports each window so
  loop-synced tracks are scheduled in it. Follower windows are `[swung(cursor), swung(end))`: `swung(end)` is
  recomputed from the same `end` as the next window's start, so consecutive windows share the exact boundary.
- `app.track` is the active track, which is why `actions.ts`, `dragDrop.ts`, `Strip` and `SelectionBar` needed no
  change. `activeTrack` is not saved: the app opens on the master.
- A reviewer subagent fuzzed the scheduler against a ground truth: 3000 random songs (1–4 tracks, nested groups,
  random sync, swing, tempo, lookahead, tick steps), 2000 with late ticks and 2000 with live edits (sync flips,
  emptied and refilled tracks, length and swing changes): every leaf exactly once per loop at its time, nothing in
  the past. Two medium findings, both fixed test-first:
  - a track joining mid-play with swing copied the reference's unwarped cursor and could sit a fraction of a slot
    off the grid until Stop (odd lengths); it now joins in swung slots;
  - an armed `Remove?` stayed armed after leaving the tab and coming back on WebKit, where a clicked button takes
    no focus and so never blurs; a tab press now disarms it.
- Known limits (low, accepted):
  - `parseSong` does not cap the number of tracks: hand-made storage with more than 8 shows them all, Add disabled.
  - The tabs are plain buttons with `role="tab"`: no arrow-key navigation, no `tabpanel`. Space on a tab toggles
    play (the transport's convention), so a tab is selected with Enter.
  - While a sync radio has focus the editing keys (Delete, M, G, I) do nothing, as with the transport's radios.
  - Tab names are positional: removing Track 2 renames Track 3 to "Track 2".
  - When the master changes length mid-loop, a loop-synced track is remapped onto the new loop from the cursor: a
    note of the loop in progress may be skipped or heard again once.
  - Not yet heard on a real device.
