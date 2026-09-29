# 03 — Groups

Status: done
Branch: feat/01-03-core-ops

## Behaviour

Grouping is nested subdivision (PLAN.md §1): a group takes one slot and its children share it evenly. This
feature adds the tree operations. Timing comes from the structure alone and is covered by 04.

- `group(track, ids, nextId)` → `{ track, groupId }`. It wraps sibling nodes into a new group, whose id comes
  from the injected `IdGen`. The group goes where the first selected node was (document order), and its
  children keep document order. The selection does not have to be contiguous: the nodes in between shift
  after the group.
- `ungroup(track, groupId)` puts the group's children in its place, inside the group's parent (the root or
  another group).
- `move` (02) moves nodes into, out of and between groups. Normalization dissolves a group left with one child
  and removes a group left with none.

`group` returns the input track and `groupId: null`, and does not call `nextId`, when:

- fewer than 2 distinct existing nodes are selected (unknown ids are ignored, duplicates count once);
- the selected nodes do not all have the same parent;
- the selection is **every** child of a group. The new group would be that group's only child, so
  normalization would remove it again. Timing would not change, and a fresh id would replace the old group
  id for nothing. Selecting every node at the root is allowed: that squeezes the whole pattern into one slot.

## Acceptance criteria

- [x] Grouping two adjacent root squares puts a new group (id from `nextId`) in their place; `groupId` is it.
- [x] Grouping non-contiguous siblings puts the group at the first one's position, children in document order,
      whatever the order of `ids`: `A B C D E`, group `[D,B]` → `A g1[B D] C E`.
- [x] Grouping siblings inside a group nests a new group there: `A G[B C D]`, group C,D → `A G[B g1[C D]]`.
- [x] Groups can be grouped with squares: `G[A B] C`, group G,C → `g1[G[A B] C]`.
- [x] Grouping every root node gives one group holding the whole pattern.
- [x] `group` is a no-op (same track, `groupId: null`, `nextId` not called) for < 2 distinct known nodes,
      different parents, or every child of a group.
- [x] `ungroup` puts the children in the group's place, at the root or inside the parent group.
- [x] `ungroup` returns the same track for an unknown id or a square id.
- [x] `group` followed by `ungroup` of the new group gives back the original structure.
- [x] Moving a square into a group adds a child there: `A B G[C D]`, move A into G at 1 → `B G[C A D]`.
- [x] Moving a child out of a 2-child group dissolves the group: `A G[B C] D`, move B to root 0 → `B A C D`.
- [x] Moving a child out to just after its group (root index as displayed) lands after the remaining child:
      `A G[B C] D`, move B to root 2 → `A C B D`.
- [x] Moving all children out of a group removes the group: `A G[B C] D`, move B,C to root 4 → `A D B C`.
- [x] Moving out of a nested group dissolves only that group: `G[A H[B C]]`, move B into G at 0 → `G[B A C]`.
- [x] Moving a group into another group nests it as one block: `G[A B] H[C D]`, move G into H at 1 →
      `H[C G[A B] D]`.
- [x] Moving a group into itself or into one of its descendants is a no-op.
- [x] Moving nodes from different parents together gathers them in document order at the target.
- [x] Results are normalized, ids stay unique, and inputs are not mutated (deep-frozen).

## Edge cases

- Moving a group's own child to another index of that group reorders it (02). Moving a selection that includes a
  child of the target group adjusts the index for that child only.
- An id generator returning an id already in the track breaks invariant 3. Callers must use one generator
  per song. This is a precondition, not something `group` checks.

## Out of scope

- Timeline / durations (04), group UI (07), drag hit-testing (08), group span > 1 (future).

## Files

`src/core/ops.ts`, `src/core/ops.group.test.ts`.

## Notes (added during review/doc step)

- Signature: `group(track, ids, nextId: IdGen)`. The id generator is a third parameter, as PLAN.md §2.2 needs
  for deterministic ids. `nextId` is called only when a group is really created.
- In `ops.ts`, the model's `group` constructor is imported as `makeGroup` because the op has the same name.
  Callers that need both should alias one of them.
- Moving into or out of groups needed no new code. `move` (02) plus `normalize` covers every case in this doc,
  so those tests pass since 02 and pin the group semantics.
- Extension to PLAN.md: selecting every child of a non-root group is a no-op (see Behaviour). Grouping a group
  together with one of its descendants is a no-op too, because they have different parents.
- Review: a temporary randomized check (3000 random trees, never committed) ran `move`, `group`, `ungroup` and
  `remove`. It confirmed that results stay normalized, ids stay unique, squares are never lost or duplicated,
  and frozen inputs are left untouched.

## Update 2026-09-29: Group joins an existing group (user report)

The user pressed Group with a square inside a group plus another square, expecting to add it to the group, and got
a nested group instead. The UI now uses `groupOrJoin(track, ids, nextId)` (`core/ops.ts`); `group` stays the
primitive.

- The selection contains exactly one group plus siblings of it → those siblings **join** the group: the ones before
  it go to its start, the ones after it go to its end (timeline order).
- The selection has squares inside group G plus squares that are siblings of G → the outside squares join G.
- Everything inside the same group (and not all of its children) → a new sub-group (explicit nesting, as before).
- Two or more groups, or plain siblings → a new group (as before). Unrelated places → nothing.
