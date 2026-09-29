# Moving Sequencer

A small step sequencer for the browser (desktop and phone). Every sound is a square, and every square is one
subdivision. Rearrange squares with drag and drop **while the pattern plays**. Group squares to squeeze them into one
slot (triplets, quintuplets, …) and ungroup them to spread them back out.

**Editing**: tap a sound in the palette to add a square (after the selection, or at the end). Click a square to
select it; Shift/Cmd/Ctrl-click adds to the selection (on a phone every tap toggles). The selection bar mutes,
changes the sound, groups, ungroups or deletes. Keys: Delete/Backspace, M (mute), G (group), Shift+G (ungroup),
Escape (clear selection).

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
