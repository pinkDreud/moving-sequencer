# 00 — Scaffold

Status: done
Branch: main (initial setup)

## Behaviour

The project builds, tests and lints. It contains no features yet. The page shows the app title.

## Acceptance criteria

- [x] `npm run verify` (lint + check + unit tests) passes, with one smoke unit test and one component test.
- [x] `npm run test:e2e` passes a smoke test (page loads, title visible) on chromium, webkit, mobile-safari, mobile-chrome.
- [x] `npm run build` produces `dist/` with base path `/moving-sequencer/` for GitHub Pages.
- [x] CI workflow runs verify + e2e + build on push and PR.
- [~] ~~Deploy workflow publishes `dist/` to GitHub Pages~~. Removed: Pages is not available for a private repo on the free plan.
- [x] `src/core/model.ts` holds the shared types from PLAN.md §2.1, so features 01 and 04 can proceed in parallel.

## Files

`package.json`, `vite.config.ts`, `tsconfig*.json`, `svelte.config.js`, `eslint.config.js`, `.prettierrc`,
`playwright.config.ts`, `.github/workflows/ci.yml`, `src/main.ts`, `src/ui/App.svelte`, `src/core/model.ts`.

## Notes

- svelte-check only types a `.svelte` component that has a `<script lang="ts">` block. A script-less component
  imported from TS fails with "implicitly has an 'any' type". Always give components a script block.
- `base` is `/moving-sequencer/` in dev, preview and build, so paths behave the same everywhere.
- The deploy workflow was removed on 2026-09-29: GitHub answered "Your current plan does not support GitHub Pages
  for this repository" (private repo, free plan). The `/moving-sequencer/` base path stays, so re-enabling
  Pages later (public repo) only needs the workflow back from git history (commit 6ed6a84).
