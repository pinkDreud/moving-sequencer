# 00 — Scaffold
Status: in progress
Branch: main (initial setup)

## Behaviour
The project builds, tests, lints and deploys. It contains no features yet. The page shows the app title.

## Acceptance criteria
- [ ] `npm run verify` (lint + check + unit tests) passes, with one smoke unit test and one component test.
- [ ] `npm run test:e2e` passes a smoke test (page loads, title visible) on chromium, webkit, mobile-safari, mobile-chrome.
- [ ] `npm run build` produces `dist/` with base path `/moving-sequencer/` for GitHub Pages.
- [ ] CI workflow runs verify + e2e + build on push and PR.
- [ ] Deploy workflow publishes `dist/` to GitHub Pages on push to `main`.
- [ ] `src/core/model.ts` holds the shared types from PLAN.md §2.1, so features 01 and 04 can proceed in parallel.

## Files
`package.json`, `vite.config.ts`, `tsconfig*.json`, `svelte.config.js`, `eslint.config.js`, `.prettierrc`,
`playwright.config.ts`, `.github/workflows/{ci,deploy}.yml`, `src/main.ts`, `src/ui/App.svelte`, `src/core/model.ts`.
