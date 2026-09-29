import type { SoundId } from '../core/model';
import type { AppState } from '../state.svelte';
import type { Shortcut } from './shortcuts';

export function pickSound(_app: AppState, _soundId: SoundId | null, _applyToSelection: boolean): void {
  throw new Error('not implemented');
}

export function deleteSelection(_app: AppState): void {
  throw new Error('not implemented');
}

export function toggleMuteSelection(_app: AppState): void {
  throw new Error('not implemented');
}

export function groupSelection(_app: AppState): void {
  throw new Error('not implemented');
}

export function ungroupSelection(_app: AppState): void {
  throw new Error('not implemented');
}

export function runShortcut(_app: AppState, _shortcut: Shortcut): void {
  throw new Error('not implemented');
}
