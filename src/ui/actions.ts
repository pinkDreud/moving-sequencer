// Selection actions shared by the selection bar, the palette and the keyboard shortcuts.
import { square, type SoundId } from '../core/model';
import { groupOrJoin, insert, remove, setSound, toggleMute } from '../core/ops';
import type { AppState } from '../state.svelte';
import { insertTarget, selectedGroupIds, ungroupAll } from './selection';
import type { Shortcut } from './shortcuts';

/**
 * A palette tap. With `applyToSelection` and a selection, sets the sound of the selection. Otherwise inserts
 * a square after the selection (and selects it, so further taps continue in order) or appends it.
 */
export function pickSound(app: AppState, soundId: SoundId | null, applyToSelection: boolean): void {
  const ids = [...app.selection];
  if (applyToSelection && ids.length > 0) {
    app.updateTrack((t) => setSound(t, ids, soundId));
    return;
  }
  const target = insertTarget(app.track, app.selection);
  const created = square(app.nextId(), soundId);
  app.updateTrack((t) => insert(t, target, created));
  if (ids.length > 0) app.select([created.id]);
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
