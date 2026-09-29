# Progress log

Newest entry on top. Keep "Current state" accurate. It's the first thing a new session reads.

## Current state

- **Phase:** 00–08 and 11 done (389 unit, 99 e2e tests). 09 mic recording → 10 autosave are running in one
  worktree agent (`feat/09-mic-recording`, then `feat/10-autosave` branched from it).
- **Next step:** review and merge 09 and 10. v1 is then complete; next come a real-device check (sound, iOS touch,
  mic over `dev:https`) and a decision about deployment/multi-track.
  a real device and try touch drag on iOS.
- **Blockers:** none. No deployment: Pages is unavailable for a private repo on the free plan, and the user chose "no deploy for now".

## Documentation index

| Doc                        | Content                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `AGENTS.md`                | conventions and workflow (loaded every session via `CLAUDE.md`) |
| `docs/PLAN.md`             | product decisions, architecture, roadmap                        |
| `docs/features/README.md`  | feature list with status                                        |
| `docs/features/NN-slug.md` | spec + acceptance criteria for each feature                     |
| `README.md`                | user-facing: what it is, how to run                             |

## Entries

### 2026-09-29 — 11 PWA

- `vite-plugin-pwa`: manifest, auto-updating service worker (production only), and icons generated from
  `public/icons/icon.svg` by `scripts/make-icons.mjs`. The offline reload is e2e-tested on Chromium.

### 2026-09-29 — 08 drag & drop

- `src/core/dropTarget.ts` (pure hit-testing), `src/ui/drag.ts` (gesture state machine), `src/ui/dragDrop.ts`
  (DOM layout snapshot, `dragIds`, `applyDrop`), integrated into `Strip.svelte`/`NodeView.svelte`.
- A reviewer subagent found 7 issues (2 high: the click swallowed after a drop could leak to a later click, and an
  Escape-aborted drag could change the selection on release). All fixed with regression tests. Details and design
  notes in `docs/features/08-drag-drop.md`.
- Lesson: never use `setTimeout(0)` to scope "the click after this pointerup"; tie it to the next pointerdown.

### 2026-09-29 — 06 audio/transport + 07 strip UI merged

- 06: `WebAudioEngine`, `RealtimeFakeEngine`, `unlockOnGesture` (engine.ts); kit synthesized sample by sample in JS
  (kit.ts, deterministic); `createTransport` (transport.ts) drives the scheduler and the rAF playhead;
  `Transport.svelte`. `?fake-audio` exposes `window.__seqTest = { engine, app }`. Space = play/stop.
- 07: `Editor.svelte` (Strip + Palette + SelectionBar + shortcuts), `NodeView.svelte` (recursive), helpers
  `selection.ts`, `actions.ts`, `shortcuts.ts`. DOM contract for 08 is in `docs/features/07-strip-ui.md` Notes.
- The two agents' e2e runs collided on port 4173 (Playwright reused the other's server). Fixed: `PW_PORT` env and
  `reuseExistingServer: false`.
- Real audio has not been heard by a human yet. Please listen on a device (`npm run dev -- --host`).

### 2026-09-29 — app-state skeleton

- `src/state.svelte.ts`: `AppState` (song in `$state.raw`, selection, `playing`, `playheadId`, `updateTrack(op)`,
  bpm/slot setters), `defaultSong`, `randomIdGen`. `src/audio/sounds.ts`: `KIT` metadata (ids, names, colors).
- Contract between 06 and 07: 06 writes `app.playing` and `app.playheadId`; 07 only reads them.
- ESLint `svelte/prefer-svelte-reactivity` is off: our state is immutable values in `$state.raw`.

### 2026-09-29 — 04–05 timeline + scheduler merged

- `src/core/timeline.ts` (`buildTimeline`, `leafAt`, `EPSILON`), `src/core/timing.ts` (`secondsPerSlot`),
  `src/audio/engine.ts` (`AudioEngine`, `FakeEngine`), `src/audio/scheduler.ts` (`createScheduler`).
- Decisions: late ticks drop missed events instead of bursting them; `positionAt` returns `null` when stopped;
  only `tracks[0]` is scheduled; at most 1000 loop wraps per tick. Details in `docs/features/05-scheduler.md`.

### 2026-09-29 — 01–03 core ops merged

- `src/core/ops.ts`: `normalize, insert, remove, setSound, toggleMute, move, group, ungroup` plus the read helpers
  `findNode, findLocation, nodeIds`. 104 tests. Specs and decisions are in `docs/features/01..03-*.md`.
- Key decisions: a no-op returns the **same** track object (cheap change detection for scheduler and autosave);
  group ids in setSound/toggleMute target all squares below; `group(track, ids, nextId)` takes an IdGen.
- Watch out: the op `group` clashes by name with the constructor `group` in `model.ts`; alias one on import.
- Test helpers in `src/core/test-helpers.ts`: `parseTrack('A G[B C] D')`, `shape(track)`, `deepFreeze`.

### 2026-09-29 — deploy removed

- The Pages deploy failed: Pages was not enabled, and enabling it through the API returned 422 "plan does not support
  GitHub Pages" (private repo). The user chose no deploy for now. `deploy.yml` was removed and docs point to
  `npm run dev -- --host` for phone testing. `gh` is now authenticated.

### 2026-09-29 — scaffold

- Tooling: Vite 8, Svelte 5, TS 6 strict, Vitest 5 + Testing Library, Playwright (4 projects), ESLint 10 + Prettier.
- CI (`.github/workflows/ci.yml`) + Pages deploy after green CI (`deploy.yml`).
- `src/core/model.ts`: shared types and constructors, so the ops and timeline tracks can run in parallel.
- Gotcha: a component needs a `<script lang="ts">` block or svelte-check can't type its import.

### 2026-09-29 — planning

- Requirements gathered through Q&A; decisions recorded in `docs/PLAN.md` §1.
- Wrote `docs/PLAN.md`, `AGENTS.md`, `CLAUDE.md`, this log.
- `git init`, remote `origin` = `git@github.com:pinkDreud/moving-sequencer.git` (empty remote).
- Note: `gh` CLI not authenticated. Plain `git push` over SSH works. Pages must be enabled in repo
  settings (Settings → Pages → Source: GitHub Actions) or via `gh` once logged in.
