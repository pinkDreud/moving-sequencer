# 11 — PWA: installable and offline

Status: in progress
Branch: feat/11-pwa

## Behaviour

The app can be added to the home screen (phone) or installed (desktop Chrome/Edge) and opens full screen. After the
first visit it also works offline, since the app is small and everything it needs is precached.

## Acceptance criteria

- [ ] A web app manifest with name "Moving Sequencer", short name "Sequencer", `display: standalone`, dark
      theme/background colors, `start_url` and `scope` = `/moving-sequencer/`, and icons at 192 px, 512 px and
      512 px maskable (PNG).
- [ ] `apple-touch-icon` (180 px PNG) and iOS standalone meta tags, so "Add to Home Screen" on iOS looks right.
- [ ] A service worker (production build only) precaches the app shell (html, js, css, icons) and updates itself
      automatically on the next visit after a deploy.
- [ ] The dev server and unit tests are unaffected (no service worker in dev).
- [ ] e2e (chromium): the manifest is linked and served with the expected fields; the service worker gets
      activated; after going offline, a reload still renders the app.

## Notes

- Installing needs a secure context: `localhost`, or HTTPS (`npm run dev:https` from feature 09 is dev-only, without
  a service worker). Real installs will only happen once there is an HTTPS deployment.

## Files

`vite.config.ts` (vite-plugin-pwa), `index.html`, `public/icons/*`, `scripts/make-icons.mjs`, `tests/e2e/pwa.spec.ts`.
