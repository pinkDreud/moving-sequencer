// Selection actions shared by the selection bar, the palette and the keyboard shortcuts.
import { square, type SoundId } from '../core/model';
import { groupOrJoin, insert, remove, setSound, toggleMute } from '../core/ops';
import type { AppState } from '../state.svelte';
import { selectedGroupIds, ungroupAll } from './selection';
import type { Shortcut } from './shortcuts';

/**
 * A palette tap. With a selection, the selected squares (and all squares in selected groups) take the sound; with
 * nothing selected, a new square with the sound is appended at the end.
 */
export function pickSound(app: AppState, soundId: SoundId | null): void {
  const ids = [...app.selection];
  if (ids.length > 0) app.updateTrack((t) => setSound(t, ids, soundId));
  else
    app.updateTrack((t) =>
      insert(t, { parentId: null, index: t.nodes.length }, square(app.nextId(), soundId)),
    );
}

export function deleteSelection(app: AppState): void {
  const ids = [...app.selection];
  app.updateTrack((t) => remove(t, ids));
}

export function toggleMuteSelection(app: AppState): void {
  const ids = [...app.selection];
  app.updateTrack((t) => toggleMute(t, ids));
}

/** Groups the selection if possible and selects the new group. */
export function groupSelection(app: AppState): void {
  const result = groupOrJoin(app.track, [...app.selection], app.nextId);
  if (result.groupId === null) return;
  app.updateTrack(() => result.track);
  app.select([result.groupId]);
}

/** Ungroups every selected group and selects their former children. */
export function ungroupSelection(app: AppState): void {
  const groups = selectedGroupIds(app.track, app.selection);
  if (groups.length === 0) return;
  const result = ungroupAll(app.track, groups);
  app.updateTrack(() => result.track);
  app.select(result.childIds);
}

export function runShortcut(app: AppState, shortcut: Shortcut): void {
  switch (shortcut) {
    case 'delete':
      return deleteSelection(app);
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
