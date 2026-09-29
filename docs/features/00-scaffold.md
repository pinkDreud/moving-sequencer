# 00 — Scaffold

Status: done
Branch: main (initial setup)

## Behaviour

The project builds, tests, lints and deploys. It contains no features yet. The page shows the app title.

## Acceptance criteria

- [x] `npm run verify` (lint + check + unit tests) passes, with one smoke unit test and one component test.
- [x] `npm run test:e2e` passes a smoke test (page loads, title visible) on chromium, webkit, mobile-safari, mobile-chrome.
- [x] `npm run build` produces `dist/` with base path `/moving-sequencer/` for GitHub Pages.
- [x] CI workflow runs verify + e2e + build on push and PR.
- [x] Deploy workflow publishes `dist/` to GitHub Pages on push to `main`.
- [x] `src/core/model.ts` holds the shared types from PLAN.md §2.1, so features 01 and 04 can proceed in parallel.

## Files

`package.json`, `vite.config.ts`, `tsconfig*.json`, `svelte.config.js`, `eslint.config.js`, `.prettierrc`,
`playwright.config.ts`, `.github/workflows/{ci,deploy}.yml`, `src/main.ts`, `src/ui/App.svelte`, `src/core/model.ts`.

## Notes

- svelte-check only types a `.svelte` component that has a `<script lang="ts">` block. A script-less component
  imported from TS fails with "implicitly has an 'any' type". Always give components a script block.
- `base` is `/moving-sequencer/` in dev, preview and build, so paths behave the same everywhere.
- Deploy runs only after CI succeeds on `main` (`workflow_run`). It can also be started by hand.
