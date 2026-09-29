# Moving Sequencer

A small step sequencer for the browser (desktop and phone). Every sound is a square, and every square is one
subdivision. Rearrange squares with drag and drop **while the pattern plays**. Group squares to squeeze them into one
slot (triplets, quintuplets, …) and ungroup them to spread them back out.

**Play**: Play/Stop (or Space), BPM, and what one slot is worth (1/4, 1/8, 1/16).

**Editing**: tap a sound in the palette to add a square (after the selection, or at the end). Click a square to
select it; Shift/Cmd/Ctrl-click adds to the selection (on a phone every tap toggles). The selection bar mutes,
changes the sound, groups, ungroups or deletes. Keys: Delete/Backspace, M (mute), G (group), Shift+G (ungroup),
Escape (clear selection).

**Moving**: drag a square with the mouse, or long-press it on a phone and then move your finger. The yellow line
shows where it lands, which can be between squares, inside a group, or out of a group. Dragging a selected square
moves the whole selection, and a group moves as one block. Drop it well outside the pattern to delete it. Escape
cancels. It all works while playing, and the change is heard on the next subdivision.

**Recording**: press **Record** at the end of the palette, allow the microphone, make a sound, and press **Stop** (it
stops by itself after 4 s). The recording becomes a new sound, "Rec 1", with the leading silence cut and the volume
evened out. Use it like any other sound. Its × button deletes it (press twice); the squares that used it turn silent.
The microphone needs a secure page: `localhost` or HTTPS (see `npm run dev:https` below).

No public deployment yet. To try it on a phone, run the dev server on your LAN (see below).

## Development

```sh
npm install
npm run dev        # http://localhost:5173/moving-sequencer/
npm run dev -- --host   # also reachable from a phone on the same Wi-Fi (URL printed in the terminal)
npm run dev:https  # same over HTTPS (self-signed), so the phone's mic works; accept the certificate warning
npm run verify     # lint + typecheck + unit tests
npm run test:e2e   # Playwright (first time: npx playwright install chromium webkit)
```

Contributing (humans and LLMs): read [`AGENTS.md`](AGENTS.md), then [`docs/LOG.md`](docs/LOG.md) and
[`docs/PLAN.md`](docs/PLAN.md).
