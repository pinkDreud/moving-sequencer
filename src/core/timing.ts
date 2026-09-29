import type { SlotValue, TempoFactor } from './model';

/**
 * Duration of one top-level slot in seconds: a quarter note lasts 60 / bpm, a 1/n note 4/n of that, and the
 * tempo factor speeds it all up (2×) or slows it down (½×).
 */
export function secondsPerSlot(bpm: number, slotValue: SlotValue, factor: TempoFactor = 1): number {
  return ((60 / bpm) * (4 / slotValue)) / factor;
}
