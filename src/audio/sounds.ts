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
