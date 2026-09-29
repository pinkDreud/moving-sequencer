# 01 — Basic ops

Status: in progress
Branch: feat/01-03-core-ops

## Behaviour

`src/core/ops.ts` offers pure, immutable edit operations on a `Track` (PLAN.md §2.2), plus read helpers:

- `normalize(track)` enforces the tree invariants (PLAN.md §2.1): groups with 0 children are removed, groups
  with 1 child are replaced by that child, recursively (bottom-up, so a group that becomes empty or
  single-child because of its children's normalization is fixed too). Unique ids are a precondition, not
  something `normalize` repairs.
- `insert(track, target, square)` inserts a square at a `DropTarget` (`{ parentId: NodeId | null; index }`,
  `null` = track root, `index` = position among the parent's current children).
- `remove(track, ids)` deletes the nodes (a group takes its descendants with it) and normalizes.
- `setSound(track, ids, soundId | null)` sets the sound of the targeted squares.
- `toggleMute(track, ids)`: if every targeted square is muted, unmute them all; otherwise mute them all.
- Read helpers: `findNode(track, id)`, `findLocation(track, id)` → `{ parentId, index }` of a node,
  `nodeIds(track)` → all ids (squares and groups) in document order (depth-first, pre-order).

**Targeting rule** (`setSound`, `toggleMute`): an id of a square targets that square; an id of a group targets
every square below it (at any depth). There is no group-level sound or mute, so this is what "mute this group"
means for the user. Unknown ids are ignored.

**Reference rule:** ops never mutate their input. Unchanged subtrees are shared by reference, and when an op
changes nothing it returns the input track itself (cheap change detection for the scheduler's memoization
and for autosave).

## Acceptance criteria

- [ ] `normalize` removes a group with no children.
- [ ] `normalize` replaces a group with exactly one child by that child, at the same position.
- [ ] `normalize` works recursively: a group whose only child is an empty group disappears; a chain of
      single-child groups collapses to the leaf; a group left with one child after its empty sub-group is
      removed is unwrapped.
- [ ] `normalize` returns the same track object when it is already normal.
- [ ] `insert` at the root puts the square at `index` (0 = first, `length` = append).
- [ ] `insert` into a group puts the square among that group's children.
- [ ] `insert` clamps an out-of-range index to `[0, length]`.
- [ ] `insert` returns the track unchanged when the parent does not exist, is a square, or the square's id is
      already used in the track.
- [ ] `remove` deletes squares and groups (with their descendants) anywhere in the tree.
- [ ] `remove` normalizes: removing one child of a 2-child group leaves the other child in the group's place;
      removing all children of a group removes the group.
- [ ] `remove` ignores unknown ids and returns the same track when nothing matched.
- [ ] `setSound` sets the sound (or `null` = silent) on the targeted squares only; a group id targets all its
      descendant squares; `muted` is kept.
- [ ] `toggleMute` mutes all targeted squares when at least one is unmuted, unmutes all when all are muted;
      a group id targets all its descendant squares.
- [ ] `setSound` / `toggleMute` return the same track when no square is targeted.
- [ ] `findNode`, `findLocation` find nodes at any depth and return `undefined` for unknown ids.
- [ ] `nodeIds` lists every node id in document order (a group before its children).
- [ ] No op mutates its input (tests run on deep-frozen tracks); untouched subtrees keep their identity.

## Edge cases

- Empty track: every op works and returns a valid (possibly empty) track.
- Duplicate or unknown ids in `ids`: duplicates count once, unknown ones are ignored.
- `toggleMute` counts silent squares (`soundId: null`) like any other square: muting them is harmless.
- `ids` containing both a group and one of its descendants: the square is targeted once.

## Out of scope

- `move` (02), `group` / `ungroup` (03), timing (04).
- Validating/repairing duplicate ids (precondition of every op).

## Files

`src/core/ops.ts`, `src/core/ops.test.ts`, `src/core/test-helpers.ts` (test-only builders: `deepFreeze`,
`parseTrack`, `shape`).

## Notes (added during review/doc step)
