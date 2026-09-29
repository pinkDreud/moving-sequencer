# Progress log

Newest entry on top. Keep "Current state" accurate. It's the first thing a new session reads.

## Current state

- **Phase:** 00–05 + app-state skeleton done (163 tests). Two worktree agents are running:
  06 audio/transport (`feat/06-audio-transport`) and 07 strip UI (`feat/07-strip-ui`).
- **Next step:** review and merge 06 and 07 (expect a small conflict in `App.svelte`), then 08 drag & drop
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
