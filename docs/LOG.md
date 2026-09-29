# Progress log

Newest entry on top. Keep "Current state" accurate. It's the first thing a new session reads.

## Current state

- **Phase:** features 00–13 are done and live (632 unit, 156 e2e tests). Issue #1 is fixed, and updates now reach open pages.
- **Next step:** review and merge 14 preparation area (worktree agent on `feat/14-prep-area`).
  `feat/14-prep-area`).
  for Pages, or Cloudflare/Netlify), multi-track, undo/redo, lasso selection, export/import.
- **Real-device checks pending:** how the kit sounds; iOS long-press drag; mic recording over `npm run dev:https`
  (trim/normalize, speaker vs earpiece after recording on iOS); autosave surviving tab close on iOS; private mode.
  mic over `dev:https`) and a decision about deployment/multi-track.
  a real device and try touch drag on iOS.
- **Blockers:** none. Live at https://pinkdreud.github.io/moving-sequencer/ (Pages, deployed after green CI on `main`).

## Documentation index

| Doc                        | Content                                                         |
| -------------------------- | --------------------------------------------------------------- |
| `AGENTS.md`                | conventions and workflow (loaded every session via `CLAUDE.md`) |
| `docs/PLAN.md`             | product decisions, architecture, roadmap                        |
| `docs/features/README.md`  | feature list with status                                        |
| `docs/features/NN-slug.md` | spec + acceptance criteria for each feature                     |
| `README.md`                | user-facing: what it is, how to run                             |

## Entries

### 2026-09-29 — 13 swing merged

- `warp`/`unwarp` in `core/timing.ts` (pairs of slots; an odd-length pattern's last slot stays straight).
  The scheduler cursor stays unwarped, and only slot↔seconds goes through the warp. A swing change mid-play applies
  from the cursor. The reviewer fuzzed 700 random scenarios: no double or missing notes.
- To check by ear: 33 % ≈ triplet shuffle, 50 % hard swing, 75 % dotted.

### 2026-09-29 — updates now reach users

- The user asked to verify "select several squares + tap a sound → all change". It already worked on the live
  site, but the user was running an old cached version. Root cause: the PWA worker never activated new versions
  until all tabs were closed. Fixed (skipWaiting/clientsClaim) and added an in-app "New version available · Reload"
  bar. Details in `docs/features/11-pwa.md` Update.
- Lesson: after a deploy, a "doesn't work" report may be a stale client. The bar now makes that visible.

### 2026-09-29 — feedback round: 12 tempo ½×/2×, specs 13 swing and 14 prep area

- The user asked for half/double tempo, swing, and a preparation area to drag figures from. Feasibility was assessed
  first and all three are doable. The decisions are in PLAN §1 and the specs `docs/features/12..14-*.md`.
- 12 is done: `Song.tempoFactor`, `secondsPerSlot(bpm, slotValue, factor)`, and the Speed control.

### 2026-09-29 — issue #1: palette tap replaces the selected sound

- First external issue (MaKiGiO, in Italian): selecting a square and tapping a sample put the sound in the next
  square. The palette now sets the sound of the selection; with no selection it appends. The Sound button is gone.
  The fix commit says "Fixes #1"; the owner asked for a reply in Italian before closing.

### 2026-09-29 — user-reported group bugs fixed

- Group with a square inside a group plus another square nested a new group (or did nothing). Group now joins the
  existing group (`groupOrJoin`); all-inside selections still make a sub-group, as the user confirmed.
- A square couldn't be dropped _into_ another square: top-level squares now have a middle "combine" zone.
- Both are reproduced as e2e tests. Details are in the "Update" sections of `docs/features/03-groups.md` and
  `08-drag-drop.md`.

### 2026-09-29 — public repo, Pages deploy restored

- The user made the repo public. Pages is enabled through the API (`build_type=workflow`), and `deploy.yml` is
  restored from history unchanged: it runs after CI succeeds on `main`, or by hand (`workflow_dispatch`).
- The site is HTTPS, so mic recording and PWA install can now be tested on a phone without `dev:https`.

### 2026-09-29 — license, credit, history rewrite

- MIT license (`LICENSE`, `package.json`). The README has a "How this was made" section: written by Claude under
  Matteo's direction.
- The author/committer email in all history was rewritten from the work address to `matteo.magherini@gmail.com`
  (the user asked for it) and `main` was force-pushed. **Every commit hash before this entry changed**, so old
  hashes seen elsewhere no longer resolve. The pre-rewrite history is kept locally as branch
  `backup/pre-email-rewrite`. The repo's `user.email` is now the gmail address.

### 2026-09-29 — 09 mic recording + 10 autosave merged (v1 complete)

- 09: `audio/sampleOps.ts` (pure trim/normalize/fades), `audio/recorder.ts`, `audio/recordings.ts`,
  `src/recordControl.svelte.ts`, the Record control and delete (press twice) in the palette, `npm run dev:https`.
- 10: `storage/validate.ts`, `storage/db.ts`, `storage/autosave.ts` (500 ms debounce, reference compare, flush on
  hide). Recordings are stored as ArrayBuffer + MIME type. On any startup failure the app falls back to the default
  song with saving off, and never overwrites a song it couldn't read.
- Each feature had its own reviewer subagent: 0 high and 4 medium findings per feature, all fixed with tests first.
  Known limits are in the spec Notes (two tabs = last write wins, and others).
- The agent hit the usage limit mid-review and was resumed with its context; no work was lost.
- Merge conflicts with the PWA work (`vite.config.ts`, README) were resolved by keeping both sides.

### 2026-09-29 — 11 PWA

- CI broke once on a docs-only commit (`6587ebc`): Prettier needed two passes to settle a markdown list, and the
  commit skipped `npm run lint`. Fixed in the next commit. Rule stands: run `npm run lint` before **every** commit,
  including `[DOC]`.
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
