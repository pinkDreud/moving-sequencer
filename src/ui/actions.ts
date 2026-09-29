// Selection actions shared by the selection bar, the palette and the keyboard shortcuts. The selection may hold
// nodes of both areas (pattern and prep): ids are unique app-wide, and an op ignores ids that are not in its track.
import type { Area } from '../core/dropTarget';
import { square, type NodeId, type SoundId, type Track } from '../core/model';
import {
  emptySquares,
  findLocation,
  findNode,
  groupOrJoin,
  insert,
  nodeIds,
  remove,
  setSound,
  toggleMute,
} from '../core/ops';
import type { AppState } from '../state.svelte';
import { selectedGroupIds, ungroupAll } from './selection';
import type { Shortcut } from './shortcuts';

const AREAS: readonly Area[] = ['pattern', 'prep'];

/** Applies the same op to both areas at once. */
function updateBoth(app: AppState, update: (track: Track) => Track): void {
  app.setTracks({ pattern: update(app.track), prep: update(app.prep) });
}

/**
 * Both areas as one throwaway track (pattern nodes, then prep nodes), for questions and ops about a selection
 * that may span them. Never stored.
 */
export function bothAreas(app: AppState): Track {
  return { id: 'both', nodes: [...app.track.nodes, ...app.prep.nodes] };
}

/** The one area holding every selected node, or null for an empty or mixed selection. */
export function selectionArea(app: AppState): Area | null {
  const ids = [...app.selection];
  return AREAS.find((a) => ids.length > 0 && ids.every((id) => findNode(app.trackOf(a), id))) ?? null;
}

/**
 * A palette tap. With a selection, the selected squares (and all squares in selected groups) take the sound, in
 * either area; with nothing selected, a new square with the sound is appended to the active area.
 */
export function pickSound(app: AppState, soundId: SoundId | null): void {
  const ids = [...app.selection];
  if (ids.length > 0) updateBoth(app, (t) => setSound(t, ids, soundId));
  else
    app.updateArea(app.activeArea, (t) =>
      insert(t, { parentId: null, index: t.nodes.length }, square(app.nextId(), soundId)),
    );
}

/** Delete key / Empty: the selected squares become empty slots; the pattern keeps its length and the selection. */
export function emptySelection(app: AppState): void {
  const ids = [...app.selection];
  updateBoth(app, (t) => emptySquares(t, ids));
}

/** Ins: an empty slot before the first selected node (inside its group), or at the end of the active area. */
export function insertEmpty(app: AppState): void {
  for (const area of AREAS) {
    const track = app.trackOf(area);
    const first = nodeIds(track).find((id) => app.selection.has(id));
    const at = first === undefined ? undefined : findLocation(track, first);
    if (at) {
      app.updateArea(area, (t) => insert(t, at, square(app.nextId(), null)));
      return;
    }
  }
  app.updateArea(app.activeArea, (t) =>
    insert(t, { parentId: null, index: t.nodes.length }, square(app.nextId(), null)),
  );
}

/** Remove (Shift+Delete, selection bar): the selected nodes are taken out and the pattern gets shorter. */
export function deleteSelection(app: AppState): void {
  const ids = [...app.selection];
  updateBoth(app, (t) => remove(t, ids));
}

/** Mutes every targeted square in both areas, or unmutes them all when all of them are muted. */
export function toggleMuteSelection(app: AppState): void {
  const ids = [...app.selection];
  // One combined track, so "all muted" is decided over both areas together. toggleMute keeps the top-level
  // node count, so the result splits back at the same place.
  const both = bothAreas(app);
  const toggled = toggleMute(both, ids);
  if (toggled === both) return;
  const split = app.track.nodes.length;
  const pattern = toggled.nodes.slice(0, split);
  const prep = toggled.nodes.slice(split);
  const same = (a: readonly unknown[], b: readonly unknown[]) => a.every((n, i) => n === b[i]);
  app.setTracks({
    pattern: same(pattern, app.track.nodes) ? app.track : { ...app.track, nodes: pattern },
    prep: same(prep, app.prep.nodes) ? app.prep : { ...app.prep, nodes: prep },
  });
}

/** Groups the selection if possible and selects the new group; a selection spanning both areas can't be grouped. */
export function groupSelection(app: AppState): void {
  const area = selectionArea(app);
  if (area === null) return;
  const result = groupOrJoin(app.trackOf(area), [...app.selection], app.nextId);
  if (result.groupId === null) return;
  app.updateArea(area, () => result.track);
  app.select([result.groupId]);
}

/** Ungroups every selected group, in both areas, and selects their former children. */
export function ungroupSelection(app: AppState): void {
  const results = AREAS.map((area) => {
    const track = app.trackOf(area);
    const groups = selectedGroupIds(track, app.selection);
    return groups.length === 0 ? { track, childIds: [] as NodeId[] } : ungroupAll(track, groups);
  });
  const [pattern, prep] = results;
  if (!pattern || !prep || results.every((r) => r.childIds.length === 0)) return;
  app.setTracks({ pattern: pattern.track, prep: prep.track });
  app.select([...pattern.childIds, ...prep.childIds]);
}

export function runShortcut(app: AppState, shortcut: Shortcut): void {
  switch (shortcut) {
    case 'empty':
      return emptySelection(app);
    case 'remove':
      return deleteSelection(app);
    case 'insert':
      return insertEmpty(app);
    case 'mute':
      return toggleMuteSelection(app);
    case 'group':
      return groupSelection(app);
    case 'ungroup':
      return ungroupSelection(app);
    case 'clear':
      return app.clearSelection();
  }
}
