# Moving Sequencer — Implementation Plan

> Audience: any developer or coding LLM picking up this project.
> Read order each session: `AGENTS.md` (conventions) → `docs/LOG.md` (where we are) → this file (what to build).
> This file describes **what** and **why**. Per-feature acceptance criteria live in `docs/features/NN-*.md`.

## 1. Product

A small web step sequencer.

- Every sound is attached to a **square**. One square = one **subdivision**.
- Squares play **in order**, left to right, and the pattern **loops forever**.
- A square may have **no sound** (silent square / rest).
- Pattern length is **not fixed**: it is simply the number of top-level slots.
- **Core experience:** rearrange squares with **drag & drop while the pattern is playing**:
  move one square, move several at once, delete one, mute one — changes are heard on the next subdivision.
- **Grouping = nested subdivision:** a group occupies **one slot**; its N children split that slot evenly
  (group of 3 in a slot = triplet). Groups nest. Ungroup expands the children back to full slots.
  Dragging a square into/out of a group changes that group's subdivision live.
- One track now; the data model is multi-track-ready (`Song.tracks[]`).
- Must work on Mac, Windows and phones → web app (PWA), pointer events for mouse/touch/pen.

### Decisions log (from user Q&A, 2026-09-29)

| Topic               | Decision                                                                      |
| ------------------- | ----------------------------------------------------------------------------- |
| Stack               | TypeScript (strict) + Vite + Svelte 5 (runes) + Web Audio API                 |
| Group span          | always 1 slot in v1; model keeps `span` field (fixed to 1) for later          |
| Group UX            | multi-select → Group button; Ungroup; drag into/out of groups                 |
| Sounds              | built-in kit (synthesized at startup) + mic recording                         |
| Timing              | BPM + slot value (4 = quarter, 8 = eighth, 16 = sixteenth)                    |
| Playback            | loop forever                                                                  |
| Live edit semantics | playhead follows **position in time** (tape-like), not the square             |
| Multi-move          | temporary multi-select, not grouping; a group always drags as one block       |
| Remove              | drag off the strip = delete (pattern shrinks); mute = silent (length kept)    |
| Tap                 | tap/click = select; SelectionBar offers Mute, Sound, Group, Ungroup, Delete   |
| Persistence         | autosave to IndexedDB (song + recordings)                                     |
| CI/CD               | GitHub Actions (lint, typecheck, unit, e2e) + GitHub Pages deploy from `main` |

## 2. Architecture

```
src/
  core/                 PURE TypeScript. No DOM, no audio, no Svelte. Most tests live here.
    model.ts            types + constructors
    ops.ts              immutable edit operations on a Track
    timeline.ts         tree -> flat list of timed leaves
    timing.ts           bpm/slotValue -> seconds
    dropTarget.ts       pure hit-testing for drag & drop
  audio/
    engine.ts           AudioEngine interface, WebAudioEngine, FakeEngine (tests / ?fake-audio)
    scheduler.ts        lookahead scheduler (clock + timer injected)
    kit.ts              built-in sounds synthesized into AudioBuffers
    recorder.ts         mic -> Blob -> AudioBuffer
  storage/db.ts         IndexedDB persistence (idb-keyval)
  state.svelte.ts       app store: song, sounds, selection, transport
  ui/                   Svelte components + drag.ts (pointer drag controller)
tests/e2e/              Playwright specs (desktop + mobile emulation)
docs/                   PLAN.md, LOG.md, features/, architecture notes
```

Dependency rule: `ui → state → (core, audio, storage)`, `audio → core`, `core → nothing`.

### 2.1 Data model (`src/core/model.ts`)

```ts
export type NodeId = string;
export type SoundId = string;

export interface Square {
  kind: 'square';
  id: NodeId;
  soundId: SoundId | null;
  muted: boolean;
}
export interface Group {
  kind: 'group';
  id: NodeId;
  span: 1;
  children: SeqNode[];
}
export type SeqNode = Square | Group;

export interface Track {
  id: string;
  nodes: SeqNode[];
}
export type SlotValue = 4 | 8 | 16;
export interface Song {
  version: 1;
  bpm: number;
  slotValue: SlotValue;
  tracks: Track[];
}

export interface Sound {
  id: SoundId;
  name: string;
  color: string;
  source: 'kit' | 'recording';
}
```

- `soundId: null` = silent square. `muted: true` = has a sound but plays nothing (keeps the sound for unmute).
- IDs come from an injectable generator (`createIdGen()`), deterministic in tests.

**Invariants** (every op returns a track satisfying them — enforce via one `normalize(track)`):

1. No group has 0 children (removed).
2. No group has exactly 1 child (unwrapped: the child takes the group's place).
3. IDs unique across the track.

### 2.2 Operations (`src/core/ops.ts`) — all pure, return a new Track (input untouched)

A **drop target** is `{ parentId: NodeId | null; index: number }` where `parentId: null` = the track root and
`index` is a position in the parent's children **as currently displayed (moved items still included)**.

| Op                                    | Semantics                                                                                                                                                                                              |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `insert(track, target, square)`       | insert at target                                                                                                                                                                                       |
| `remove(track, ids)`                  | delete nodes (descendants go with them); normalize                                                                                                                                                     |
| `setSound(track, ids, soundId\|null)` | for squares in ids                                                                                                                                                                                     |
| `toggleMute(track, ids)`              | if all selected squares are muted → unmute all, else mute all                                                                                                                                          |
| `move(track, ids, target)`            | see below                                                                                                                                                                                              |
| `group(track, ids)`                   | ids must share the same parent and be ≥ 2, else unchanged; the new group is placed at the position of the first selected node (document order), children in document order; returns `{track, groupId}` |
| `ungroup(track, groupId)`             | replace group with its children in place (into the parent, which may be another group)                                                                                                                 |

`move` algorithm:

1. Drop ids that are descendants of other selected ids (they move with their ancestor).
2. If `target.parentId` is one of the moved nodes or a descendant of one → no-op.
3. Collect moved nodes in document order (depth-first).
4. `adjusted = target.index − (number of moved nodes that are direct children of target parent with original index < target.index)`.
5. Remove moved nodes, insert them contiguously at `adjusted` in the target parent, normalize.
   Moving into a group = target parent is that group. Moving out = target parent is root or another group.

### 2.3 Timeline (`src/core/timeline.ts`) and timing (`src/core/timing.ts`)

`buildTimeline(track) → { length: number; leaves: Leaf[] }`
`Leaf = { nodeId, soundId: SoundId | null, audible: boolean, start: number, duration: number }` (units: slots)

- Top-level node i occupies `[i, i+1)` (span is always 1 for now; `length = Σ span`).
- A group divides its interval evenly among children, recursively.
- `audible = soundId !== null && !muted`.
- `secondsPerSlot(bpm, slotValue) = (60 / bpm) * (4 / slotValue)`.

### 2.4 Scheduler (`src/audio/scheduler.ts`)

Classic Web Audio lookahead scheduler ("A Tale of Two Clocks").

- Dependencies injected: `engine: AudioEngine` (`now()`, `play(soundId, when)`, `stopAll()`),
  `getSong: () => Song`, `timer` (`setInterval`/`clearInterval` compatible). Tests call `tick()` directly.
- Constants: tick every 25 ms, schedule ahead 0.1 s, start offset 0.05 s.
- State: `cursor` (slot-time already scheduled up to) and `cursorTime` (audio time matching `cursor`).
- Each `tick()`: read the song **fresh** (this is what makes live edits work), `buildTimeline` (memoize by
  track object identity — ops are immutable), `cursor %= length` (handles shrink), then walk forward from
  `cursor` to the horizon `now + lookahead`, crossing loop boundaries, calling `engine.play` for every audible
  leaf whose `start ∈ [cursor, windowEnd)` (epsilon 1e-9). Tempo changes apply from the current cursor.
- Empty pattern: advance `cursorTime` to the horizon, schedule nothing, keep `cursor = 0`.
- `positionAt(time) = (cursor − (cursorTime − time) / sps) mod length` → used by UI for the playhead.
- `stop()`: clear timer, `engine.stopAll()`.
- Semantics consequence: events already scheduled within the lookahead (≤ 100 ms) are not retracted.

### 2.5 Audio engine and sounds

- `WebAudioEngine`: one `AudioContext`, `resume()` on first user gesture (iOS unlock), buffers keyed by SoundId,
  tracks live `AudioBufferSourceNode`s so `stopAll()` can cancel scheduled ones.
- `FakeEngine`: manual clock + log of `{soundId, when}`. Enabled in the app with URL param `?fake-audio`,
  exposed as `window.__seqTest` for Playwright.
- Kit (synthesized, no licensing issues): kick, snare, hat, clap, rim, low/mid/high tone. Each has a color.
- Recorder: `getUserMedia` + `MediaRecorder` → Blob → `decodeAudioData`; becomes a `Sound` with `source: 'recording'`.

### 2.6 UI

- **Strip**: top-level slots in a wrapping flex row. Every slot has the same width (time ∝ width).
  A group renders inside one slot, children side by side with equal width (nested groups recurse).
  Min touch target 44 px for top-level squares.
- **Playhead**: `requestAnimationFrame` → `scheduler.positionAt(engine.now())` → highlight the leaf containing it.
- **Palette**: one button per sound + "silent"; tap appends a square (or inserts after selection).
- **Transport**: play/stop, BPM (numeric + slider, 30–300), slot value (1/4, 1/8, 1/16).
- **Selection**: mouse click = select only this; shift/cmd/ctrl-click = toggle; touch tap = toggle;
  tap on empty area = clear. Lasso on desktop (drag on empty area). SelectionBar acts on the selection.
- **Drag** (`ui/drag.ts`, pointer events, never HTML5 DnD):
  mouse/pen: drag starts after 6 px of movement; touch: long-press 300 ms then move (so page scroll still works).
  Dragging a selected square drags the whole selection; dragging an unselected one drags just it; groups move
  as a block. A ghost follows the pointer; a drop indicator shows the target from `dropTarget()`.
  Releasing > 40 px outside the strip = delete. Escape / pointercancel = abort.
- `dropTarget(pointer, layout, stripRect)` is pure: `layout` is a list of `{id, parentId, index, rect, kind}`.
  Innermost element under the pointer wins. Square: left half → before, right half → after (in its parent).
  Group: outer 20 % on each side → before/after the group; inner area → inside, index by child midpoints.
  In a gap / end of a row → nearest element in that row. Outside the strip beyond threshold → `'delete'`.

### 2.7 Persistence

IndexedDB via `idb-keyval`: key `song` (JSON, `version` field for migrations), key `recording:<id>` (Blob).
Autosave debounced 500 ms after each change; restore on load; fallback to a default demo pattern.

## 3. Roadmap (each item = one feature cycle, see AGENTS.md §Workflow)

| #   | Feature                                                          | Depends on | Parallelizable with |
| --- | ---------------------------------------------------------------- | ---------- | ------------------- |
| 00  | Scaffold: tooling, CI, Pages deploy, docs, `core/model.ts` types | —          | —                   |
| 01  | Basic ops: insert, remove, setSound, toggleMute, normalize       | 00         | 04                  |
| 02  | Move ops (single, multi, groups as block)                        | 01         | 04, 05              |
| 03  | Group / ungroup / move into-out of groups                        | 02         | 05                  |
| 04  | Timeline + timing                                                | 00         | 01–03               |
| 05  | Scheduler (fake clock tests, live edit tests)                    | 04         | 02, 03              |
| 06  | Audio engine + kit + transport UI                                | 05         | 07                  |
| 07  | Strip UI, palette, selection, SelectionBar, playhead             | 03, 04     | 06                  |
| 08  | Drag & drop (dropTarget + controller + delete-by-drag + lasso)   | 07         | 09                  |
| 09  | Mic recording                                                    | 06         | 08                  |
| 10  | Autosave (IndexedDB)                                             | 07         | 09                  |
| 11  | PWA: manifest, installable, offline                              | 10         | —                   |

Parallel work: run independent features in separate git worktrees (one agent each), merge sequentially.

## 4. Verification

- `npm run test` — Vitest unit + component tests.
- `npm run test:e2e` — Playwright: Chromium, WebKit, iPhone and Pixel emulation, with `?fake-audio`.
- `npm run lint`, `npm run check` — ESLint, svelte-check (TypeScript).
- CI must be green on `main`; after deploy, manual check on the Pages URL on desktop and phone.

## 5. Future (out of scope for v1, keep the door open)

Multi-track (add tracks to `Song.tracks`, one Strip per track, shared transport) · group span > 1 ·
undo/redo (ops are pure → trivial history stack) · per-square volume/pitch · export/import file · share via URL.
