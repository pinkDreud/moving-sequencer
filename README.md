# Moving Sequencer

A small step sequencer for the browser (desktop and phone). Every sound is a square, and every square is one
subdivision. Rearrange squares with drag and drop **while the pattern plays**. Group squares to squeeze them into one
slot (triplets, quintuplets, …) and ungroup them to spread them back out.

No public deployment yet. To try it on a phone, run the dev server on your LAN (see below).

## Development

```sh
npm install
npm run dev        # http://localhost:5173/moving-sequencer/
npm run dev -- --host   # also reachable from a phone on the same Wi-Fi (URL printed in the terminal)
npm run verify     # lint + typecheck + unit tests
npm run test:e2e   # Playwright (first time: npx playwright install chromium webkit)
```

Contributing (humans and LLMs): read [`AGENTS.md`](AGENTS.md), then [`docs/LOG.md`](docs/LOG.md) and
[`docs/PLAN.md`](docs/PLAN.md).
