// Test-only helpers for UI tests. Not imported by app code.
import { createIdGen, type SeqNode, type Song, type Track } from '../core/model';
import { parseTrack } from '../core/test-helpers';
import { AppState } from '../state.svelte';

/**
 * An AppState holding one track (a `parseTrack` spec or nodes), with ids `n1, n2…` and a preset selection.
 * `prep` fills the preparation area (a `parseTrack` spec).
 */
export function makeApp(track: string | SeqNode[], selection: string[] = [], prep?: string): AppState {
  const t: Track = typeof track === 'string' ? parseTrack(track) : { id: 't', nodes: track };
  const song: Song = { version: 1, bpm: 120, slotValue: 8, tracks: [t] };
  const app = new AppState({ song, nextId: createIdGen('n') });
  if (prep !== undefined) app.prep = parseTrack(prep, 'prep');
  app.select(selection);
  return app;
}
