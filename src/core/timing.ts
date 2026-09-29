import type { SlotValue } from './model';

/** Duration of one top-level slot in seconds: a quarter note lasts 60 / bpm, a 1/n note 4/n of that. */
export function secondsPerSlot(bpm: number, slotValue: SlotValue): number {
  return (60 / bpm) * (4 / slotValue);
}
