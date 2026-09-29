import { describe, expect, it } from 'vitest';
import { secondsPerSlot, SWING_MAX, unwarp, warp } from './timing';

describe('secondsPerSlot', () => {
  it('converts bpm and slot value to the duration of one slot', () => {
    expect(secondsPerSlot(120, 4)).toBe(0.5);
    expect(secondsPerSlot(120, 8)).toBe(0.25);
    expect(secondsPerSlot(120, 16)).toBe(0.125);
    expect(secondsPerSlot(60, 4)).toBe(1);
  });

  it('divides by the tempo factor: 2× halves the slot, ½× doubles it', () => {
    expect(secondsPerSlot(120, 8, 2)).toBe(0.125);
    expect(secondsPerSlot(120, 8, 0.5)).toBe(0.5);
    expect(secondsPerSlot(120, 8, 1)).toBe(0.25);
  });
});

describe('warp / unwarp (swing)', () => {
  it('stretches the first slot of each pair and squeezes the second, keeping pair boundaries', () => {
    expect(warp(0, 0.5, 4)).toBe(0);
    expect(warp(0.5, 0.5, 4)).toBe(0.75);
    expect(warp(1, 0.5, 4)).toBe(1.5);
    expect(warp(1.5, 0.5, 4)).toBe(1.75);
    expect(warp(2, 0.5, 4)).toBe(2);
    expect(warp(3, 0.5, 4)).toBe(3.5);
    expect(warp(4, 0.5, 4)).toBe(4);
    expect(unwarp(1.5, 0.5, 4)).toBe(1);
    expect(unwarp(3.75, 0.5, 4)).toBe(3.5);
  });

  it('puts the offbeat at 4/3 with a third of a slot of swing (triplet feel)', () => {
    expect(warp(1, 1 / 3, 2)).toBeCloseTo(4 / 3, 12);
  });

  it('is the identity at swing 0', () => {
    for (const p of [0, 1 / 3, 0.5, 1, 1.25, 1 + 2 / 3, 2, 3.999, 5, 6]) {
      expect(warp(p, 0, 6)).toBe(p);
      expect(unwarp(p, 0, 6)).toBe(p);
    }
  });

  it('leaves the last slot of an odd-length pattern unswung, so the loop length is unchanged', () => {
    expect(warp(1, 0.5, 3)).toBe(1.5);
    expect(warp(2, 0.5, 3)).toBe(2);
    expect(warp(2.5, 0.5, 3)).toBe(2.5);
    expect(warp(3, 0.5, 3)).toBe(3);
    expect(unwarp(2.5, 0.5, 3)).toBe(2.5);
    expect(warp(0.5, 0.5, 1)).toBe(0.5);
    expect(warp(1, 0.5, 1)).toBe(1);
  });

  it('is monotonic and exactly inverted by unwarp, tuplet positions inside a slot included', () => {
    const positions: number[] = [];
    for (let i = 0; i <= 7 * 60; i++) positions.push(i / 60); // thirds, fifths, quarters… of a slot
    for (const length of [1, 2, 5, 6, 7]) {
      for (const swing of [0, 0.01, 0.2, 1 / 3, 0.5, 0.75]) {
        let previous = -Infinity;
        for (const p of positions.filter((q) => q <= length)) {
          const w = warp(p, swing, length);
          expect(w).toBeGreaterThanOrEqual(previous);
          previous = w;
          expect(unwarp(w, swing, length)).toBeCloseTo(p, 12);
          expect(warp(unwarp(p, swing, length), swing, length)).toBeCloseTo(p, 12);
        }
      }
    }
  });

  it('clamps swing to [0, 0.75] (NaN counts as 0), so the inverse never divides by zero', () => {
    expect(SWING_MAX).toBe(0.75);
    expect(warp(1, 1, 2)).toBe(1.75);
    expect(unwarp(1.9, 1, 2)).toBeCloseTo(1.6, 12);
    expect(warp(1, -0.5, 2)).toBe(1);
    expect(warp(1, NaN, 2)).toBe(1);
    expect(unwarp(1.5, NaN, 2)).toBe(1.5);
  });
});
