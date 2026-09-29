import type { Sound } from '../core/model';

/** Built-in kit metadata. The buffers are synthesized by `kit.ts`; ids are stable (saved songs refer to them). */
export const KIT: readonly Sound[] = [
  { id: 'kick', name: 'Kick', color: '#ff5d5d', source: 'kit' },
  { id: 'snare', name: 'Snare', color: '#ffd23f', source: 'kit' },
  { id: 'hat', name: 'Hat', color: '#5ee07a', source: 'kit' },
  { id: 'clap', name: 'Clap', color: '#4da3ff', source: 'kit' },
  { id: 'rim', name: 'Rim', color: '#c48bff', source: 'kit' },
  { id: 'tone-low', name: 'Low', color: '#ff9a3c', source: 'kit' },
  { id: 'tone-mid', name: 'Mid', color: '#2fd4c4', source: 'kit' },
  { id: 'tone-high', name: 'High', color: '#ff66c4', source: 'kit' },
];

/** Colors of recorded sounds, used in turn; lighter than the kit's so recordings stand out. */
export const RECORDING_COLORS: readonly string[] = [
  '#b8f25c',
  '#ffb3b3',
  '#8fd3ff',
  '#e0c2ff',
  '#ffe08a',
  '#9ff0d8',
];

const REC_NAME = /^Rec (\d+)$/;

/**
 * Sound metadata for a new recording: id `rec-<key>` (no kit id starts with `rec-`), name `Rec N` after the
 * highest existing `Rec N`, and the next recording color.
 */
export function newRecordingSound(existing: readonly Sound[], key: string): Sound {
  const numbers = existing
    .filter((s) => s.source === 'recording')
    .map((s) => Number(REC_NAME.exec(s.name)?.[1] ?? 0));
  const n = Math.max(0, ...numbers) + 1;
  const color = RECORDING_COLORS[(n - 1) % RECORDING_COLORS.length] ?? '#ccc';
  return { id: `rec-${key}`, name: `Rec ${n}`, color, source: 'recording' };
}
