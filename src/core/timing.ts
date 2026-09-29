import type { SlotValue, TempoFactor } from './model';

/**
 * Duration of one top-level slot in seconds: a quarter note lasts 60 / bpm, a 1/n note 4/n of that, and the
 * tempo factor speeds it all up (2×) or slows it down (½×).
 */
export function secondsPerSlot(bpm: number, slotValue: SlotValue, factor: TempoFactor = 1): number {
  return ((60 / bpm) * (4 / slotValue)) / factor;
}

/** Largest swing (offbeat delay in slots): past it the second slot of a pair would shrink towards nothing. */
export const SWING_MAX = 0.75;

/** The swing as an offbeat delay in `[0, SWING_MAX]`; NaN and negatives mean straight. */
function delay(swing: number): number {
  return swing > 0 ? Math.min(swing, SWING_MAX) : 0;
}

/** Start of the pair containing `position`, or null when that pair is incomplete (last slot of an odd length). */
function pairStart(position: number, length: number): number | null {
  const start = 2 * Math.floor(position / 2);
  return start + 2 <= length ? start : null;
}

/**
 * Swung time of a slot position in `[0, length]`: in each complete pair of slots the first is stretched to
 * `1 + swing` and the second squeezed to `1 − swing`, so pairs (and the loop) keep their length.
 */
export function warp(position: number, swing: number, length: number): number {
  const d = delay(swing);
  const start = pairStart(position, length);
  if (d === 0 || start === null) return position;
  const p = position - start;
  return start + (p < 1 ? p * (1 + d) : 1 + d + (p - 1) * (1 - d));
}

/** Inverse of `warp`: the slot position heard at swung time `time`. */
export function unwarp(time: number, swing: number, length: number): number {
  const d = delay(swing);
  // Pair boundaries are fixed points of the warp, so the pair can be found from the swung time too.
  const start = pairStart(time, length);
  if (d === 0 || start === null) return time;
  const t = time - start;
  return start + (t < 1 + d ? t / (1 + d) : 1 + (t - 1 - d) / (1 - d));
}
