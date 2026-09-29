# AGENTS.md — conventions for every contributor (human or LLM)

Load this file at the start of every session. Then read `docs/LOG.md` to see where the project is,
and `docs/PLAN.md` for the design. Do not start coding before reading all three.

## Project map

| What                                                | Where                      |
| --------------------------------------------------- | -------------------------- |
| Design & roadmap                                    | `docs/PLAN.md`             |
| Progress log (current state, next step)             | `docs/LOG.md`              |
| Per-feature specs + acceptance criteria             | `docs/features/NN-slug.md` |
| Pure logic (model, ops, timeline, drop hit-testing) | `src/core/`                |
| Audio (engine, scheduler, kit, recorder)            | `src/audio/`               |
| Persistence                                         | `src/storage/`             |
| App state (Svelte runes store)                      | `src/state.svelte.ts`      |
| UI components                                       | `src/ui/`                  |
| E2E tests                                           | `tests/e2e/`               |

## Workflow (one feature at a time)

1. **Define** — write/complete `docs/features/NN-slug.md`: behaviour, edge cases, acceptance criteria.
   Branch: `git switch -c feat/NN-slug`.
2. **Test first** — write tests that encode the acceptance criteria. They must fail for the right reason.
   Commit: `[TEST] <feature>: <what is specified>`.
3. **Code** — the minimum that makes the tests pass, then tidy. `npm run verify` must be green.
   Commit: `[FEATURE] <summary>`.
4. **Review** — review the branch diff (`/code-review` or a reviewer subagent). Fix findings with tests.
   Commits: `[BUGFIX]` / `[REFACTOR]`.
5. **Document** — update the feature doc (status: done), README if user-facing, `docs/LOG.md`.
   Commit: `[DOC] <summary>`.
6. **Merge** — `git switch main && git merge --no-ff feat/NN-slug && git push origin main`.
7. Next feature.

Never skip step 2. Bugs get a failing regression test before the fix.

## Commits

- Format: `[TAG] imperative summary` (≤ 72 chars), blank line, optional body explaining _why_.
- Tags: `[FEATURE] [BUGFIX] [TEST] [DOC] [CI] [REFACTOR] [CHORE]`.
- One logical change per commit. `[TEST]` commits may have failing tests (feature branch only);
  every other commit must pass `npm run verify`.
- LLM-authored commits end with the tool's co-author trailer.

## Code conventions

- **TypeScript strict**, no `any` (use `unknown` + narrowing), no non-null `!` unless justified in a comment.
- **`src/core` is pure**: no DOM, no Web Audio, no Svelte, no `Date.now()`/`Math.random()` —
  inject ids and clocks. Everything in core is unit-tested.
- **Immutability**: ops return new objects and never mutate inputs (tests assert this).
  Unchanged subtrees may be shared by reference.
- **Dependency direction**: `ui → state → core/audio/storage`; `audio → core`; `core → nothing`.
- **App state** (`src/state.svelte.ts`, class `AppState`): immutable values in `$state.raw`, replaced on change and
  never mutated in place. Edits go through `app.updateTrack(t => op(t, …))` with the pure ops.
  The lint rule `svelte/prefer-svelte-reactivity` is off for this reason.
- **Svelte 5 runes** (`$state`, `$derived`, `$effect`, `$props`); no legacy `export let` or stores.
- Components stay thin: logic goes to `core/` or `state.svelte.ts` where it can be unit-tested.
- **Input**: pointer events only (`pointerdown/move/up/cancel`), never HTML5 drag-and-drop (broken on mobile).
  Touch targets ≥ 44 px. Everything must work with mouse, touch and pen.
- **Audio**: all sound timing goes through the scheduler with `AudioContext.currentTime`; never `setTimeout` for notes.
- Naming: `camelCase` functions/vars, `PascalCase` types/components, `kebab-case` for docs, `NN-slug` for features.
  Files: `thing.ts` + colocated `thing.test.ts`; components `PascalCase.svelte` + `PascalCase.test.ts`.
- Comments explain _why_, not _what_. Public core functions get a one-line doc comment.
- Formatting by Prettier, linting by ESLint — don't hand-format against them.
- Accessibility: buttons are `<button>`, squares have `aria-label` (sound name / "silent") and `aria-pressed` for selection.

## Tests

- Unit/component: Vitest (+ @testing-library/svelte, jsdom). Colocated `*.test.ts`.
- E2E: Playwright in `tests/e2e/`, app opened with `?fake-audio` so scheduled sounds can be asserted via
  `window.__seqTest`. Projects: chromium, webkit, mobile-safari (iPhone), mobile-chrome (Pixel).
- Test names describe behaviour: `it('moves three squares after the last one keeping their order')`.
- Use deterministic id generators and fake clocks. No sleeps in unit tests.

## Commands

| Command                           | Does                                                       |
| --------------------------------- | ---------------------------------------------------------- |
| `npm run dev`                     | dev server                                                 |
| `npm run test`                    | unit + component tests                                     |
| `npm run test:e2e`                | Playwright                                                 |
| `npm run lint` / `npm run format` | ESLint / Prettier                                          |
| `npm run check`                   | svelte-check + tsc                                         |
| `npm run verify`                  | lint + check + test (run before every non-`[TEST]` commit) |
| `npm run build`                   | production build (`dist/`)                                 |

## Working with agents

- Independent roadmap items (see PLAN.md §3 "Parallelizable with") can run in parallel, each agent in its own
  git worktree on its own `feat/NN-slug` branch, following this same workflow. Merge one at a time, rebasing the rest.
- Parallel agents run e2e on their own port: `PW_PORT=41xx npm run test:e2e`. The config never reuses a running server.
- An agent's brief must name: the feature doc, the files it owns, and "follow AGENTS.md".
- Whoever finishes a step updates `docs/LOG.md`.
