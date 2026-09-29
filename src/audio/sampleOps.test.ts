import { describe, expect, it } from 'vitest';
import {
  dbToGain,
  fadeOut,
  mixToMono,
  normalizePeak,
  processRecording,
  trimLeadingSilence,
} from './sampleOps';

const SR = 1000; // 1 sample per ms keeps the numbers readable

const peakOf = (samples: Float32Array) => samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);

/** `silence` zero samples followed by `tone` samples at `level` (alternating sign). */
function signal(silence: number, tone: number, level: number): Float32Array {
  const out = new Float32Array(silence + tone);
  for (let i = 0; i < tone; i++) out[silence + i] = i % 2 === 0 ? level : -level;
  return out;
}

describe('dbToGain', () => {
  it('converts decibels to a linear gain', () => {
    expect(dbToGain(0)).toBe(1);
    expect(dbToGain(-20)).toBeCloseTo(0.1, 10);
    expect(dbToGain(-40)).toBeCloseTo(0.01, 10);
    expect(dbToGain(-1)).toBeCloseTo(0.891251, 5);
  });
});

describe('mixToMono', () => {
  it('averages the channels sample by sample', () => {
    const mono = mixToMono([Float32Array.from([1, 0.5, 0]), Float32Array.from([0, 0.5, -1])]);
    expect([...mono]).toEqual([0.5, 0.5, -0.5]);
  });

  it('returns a copy of a single channel, never the input itself', () => {
    const input = Float32Array.from([0.25, -0.25]);
    const mono = mixToMono([input]);
    expect([...mono]).toEqual([0.25, -0.25]);
    expect(mono).not.toBe(input);
  });

  it('gives an empty signal for no channels', () => {
    expect(mixToMono([])).toHaveLength(0);
  });
});

describe('trimLeadingSilence', () => {
  it('cuts everything before the first sample at or above -40 dBFS', () => {
    const input = signal(200, 50, 0.5);
    input[100] = 0.005; // below the threshold: still silence
    const out = trimLeadingSilence(input, SR);
    expect(out).toHaveLength(50);
    expect(out[0]).toBeCloseTo(0.5, 6);
  });

  it('counts negative samples too', () => {
    const input = signal(10, 5, 0.5).map((x) => -Math.abs(x));
    expect(trimLeadingSilence(input, SR)).toHaveLength(5);
  });

  it('never trims more than the first second', () => {
    const out = trimLeadingSilence(signal(1500, 100, 0.5), SR);
    expect(out).toHaveLength(600);
  });

  it('trims at most 1 s of an all-silent recording', () => {
    expect(trimLeadingSilence(new Float32Array(3000), SR)).toHaveLength(2000);
  });

  it('never leaves an empty signal', () => {
    expect(trimLeadingSilence(new Float32Array(300), SR)).toHaveLength(1);
  });

  it('leaves a signal that starts loud unchanged (as a copy) and does not mutate its input', () => {
    const input = signal(0, 10, 0.5);
    const before = [...input];
    const out = trimLeadingSilence(input, SR);
    expect([...out]).toEqual(before);
    expect(out).not.toBe(input);
    expect([...input]).toEqual(before);
  });

  it('accepts a custom threshold and limit', () => {
    const input = signal(100, 10, 0.05);
    expect(trimLeadingSilence(input, SR, { threshold: 0.1 })).toHaveLength(1); // nothing reaches 0.1
    expect(trimLeadingSilence(input, SR, { threshold: 0.04 })).toHaveLength(10);
    expect(trimLeadingSilence(input, SR, { maxSeconds: 0.05 })).toHaveLength(60);
  });
});

describe('normalizePeak', () => {
  it('scales the peak to -1 dBFS', () => {
    const out = normalizePeak(signal(0, 10, 0.25));
    expect(peakOf(out)).toBeCloseTo(dbToGain(-1), 6);
  });

  it('also turns a too-loud signal down', () => {
    const out = normalizePeak(Float32Array.from([0, 1, -0.5]));
    expect(out[1]).toBeCloseTo(dbToGain(-1), 6);
    expect(out[2]).toBeCloseTo(-0.5 * dbToGain(-1), 6);
  });

  it('never amplifies by more than +30 dB', () => {
    const out = normalizePeak(signal(0, 10, 0.001));
    expect(peakOf(out)).toBeCloseTo(0.001 * dbToGain(30), 6);
  });

  it('leaves an all-silent signal silent', () => {
    const out = normalizePeak(new Float32Array(5));
    expect([...out]).toEqual([0, 0, 0, 0, 0]);
  });

  it('does not mutate its input', () => {
    const input = signal(0, 4, 0.25);
    const before = [...input];
    normalizePeak(input);
    expect([...input]).toEqual(before);
  });
});

describe('fadeOut', () => {
  it('ramps the last 10 ms linearly down to 0', () => {
    const out = fadeOut(new Float32Array(100).fill(1), SR);
    expect(out[89]).toBe(1);
    expect(out[99]).toBe(0);
    expect(out[94]).toBeGreaterThan(0);
    expect(out[94]).toBeLessThan(1);
    for (let i = 90; i < 100; i++) expect(out[i]).toBeLessThanOrEqual(out[i - 1] ?? 1);
  });

  it('fades the whole signal when it is shorter than the fade', () => {
    const out = fadeOut(new Float32Array(4).fill(1), SR);
    expect(out[3]).toBe(0);
    expect(out[0]).toBeLessThanOrEqual(1);
  });

  it('does not mutate its input', () => {
    const input = new Float32Array(20).fill(1);
    fadeOut(input, SR);
    expect([...input].every((x) => x === 1)).toBe(true);
  });
});

describe('processRecording', () => {
  it('mixes, trims the leading silence, normalizes to -1 dBFS and fades out', () => {
    const left = signal(300, 200, 0.2);
    const right = signal(300, 200, 0.1);
    const out = processRecording([left, right], SR);
    expect(out).toHaveLength(200);
    expect(peakOf(out)).toBeCloseTo(dbToGain(-1), 5);
    expect(Math.abs(out[199] ?? 1)).toBe(0);
  });

  it('turns an all-silent recording into a silent sound', () => {
    const out = processRecording([new Float32Array(1500)], SR);
    expect(out.length).toBeGreaterThan(0);
    expect(peakOf(out)).toBe(0);
  });
});
