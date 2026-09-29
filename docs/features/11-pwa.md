# 11 — PWA: installable and offline

Status: done
Branch: feat/11-pwa

## Behaviour

The app can be added to the home screen (phone) or installed (desktop Chrome/Edge) and opens full screen. After the
first visit it also works offline, since the app is small and everything it needs is precached.

## Acceptance criteria

- [x] A web app manifest with name "Moving Sequencer", short name "Sequencer", `display: standalone`, dark
      theme/background colors, `start_url` and `scope` = `/moving-sequencer/`, and icons at 192 px, 512 px and
      512 px maskable (PNG).
- [x] `apple-touch-icon` (180 px PNG) and iOS standalone meta tags, so "Add to Home Screen" on iOS looks right.
- [x] A service worker (production build only) precaches the app shell (html, js, css, icons) and updates itself
      automatically on the next visit after a deploy.
- [x] The dev server and unit tests are unaffected (no service worker in dev).
- [x] e2e (chromium): the manifest is linked and served with the expected fields; the service worker gets
      activated; after going offline, a reload still renders the app.

## Notes

- Installing needs a secure context: `localhost`, or HTTPS (`npm run dev:https` from feature 09 is dev-only, without
  a service worker). Real installs will only happen once there is an HTTPS deployment.

- Icons: edit `public/icons/icon.svg`, then run `node scripts/make-icons.mjs` to regenerate the PNGs. The maskable
  and apple-touch variants put the artwork inside the 80 % safe zone on a full-bleed background.
- `vite-plugin-pwa` (`generateSW`, `registerType: 'autoUpdate'`) injects `registerSW.js` into the built html. In
  dev there is no service worker.
- e2e checks the service worker on Chromium only; the other projects skip it.

## Files

`vite.config.ts` (vite-plugin-pwa), `index.html`, `public/icons/*`, `scripts/make-icons.mjs`, `tests/e2e/pwa.spec.ts`.

## Update 2026-09-29: updates reach open pages

The user kept seeing the old palette behaviour after the issue #1 fix. The cause: the generated worker only called
`skipWaiting()` when the page sent it a `SKIP_WAITING` message, and nothing did. So a new version waited until every
tab and installed-app window was closed, which can take days on a phone. Fixes:

- `workbox.skipWaiting` + `clientsClaim`: a new version takes over at once.
- `injectRegister: false`: `src/pwaUpdate.ts` registers the worker itself, calls `registration.update()` when the page
  comes back to the foreground, and reports a `controllerchange` on a page that already had a worker (i.e. it runs
  outdated code).
- `UpdateBar.svelte`: "New version available · Reload". It never reloads by itself, because that would cut playback
  and drop the preparation area.
- e2e `pwa.spec.ts` simulates a deploy by changing `dist/sw.js` on disk and expects the bar.
