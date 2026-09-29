# Progress log

Newest entry on top. Keep "Current state" accurate. It's the first thing a new session reads.

## Current state
- **Phase:** 00 scaffold, in progress
- **Next step:** finish scaffold (tooling, CI, Pages), then 01 basic ops ∥ 04 timeline
- **Blockers:** none

## Documentation index
| Doc | Content |
|---|---|
| `AGENTS.md` | conventions and workflow (loaded every session via `CLAUDE.md`) |
| `docs/PLAN.md` | product decisions, architecture, roadmap |
| `docs/features/README.md` | feature list with status |
| `docs/features/NN-slug.md` | spec + acceptance criteria for each feature |
| `README.md` | user-facing: what it is, how to run |

## Entries

### 2026-09-29
- Requirements gathered through Q&A; decisions recorded in `docs/PLAN.md` §1.
- Wrote `docs/PLAN.md`, `AGENTS.md`, `CLAUDE.md`, this log.
- `git init`, remote `origin` = `git@github.com:pinkDreud/moving-sequencer.git` (empty remote).
- Note: `gh` CLI not authenticated. Plain `git push` over SSH works. Pages must be enabled in repo
  settings (Settings → Pages → Source: GitHub Actions) or via `gh` once logged in.
