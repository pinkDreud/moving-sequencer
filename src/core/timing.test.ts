import { describe, expect, it } from 'vitest';
import { secondsPerSlot } from './timing';

describe('secondsPerSlot', () => {
  it('converts bpm and slot value to the duration of one slot', () => {
    expect(secondsPerSlot(120, 4)).toBe(0.5);
    expect(secondsPerSlot(120, 8)).toBe(0.25);
    expect(secondsPerSlot(120, 16)).toBe(0.125);
    expect(secondsPerSlot(60, 4)).toBe(1);
  });
});
