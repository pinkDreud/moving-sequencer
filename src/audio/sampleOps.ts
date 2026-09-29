// Pure processing of recorded samples. Every function returns a new array and leaves its input untouched.

/** Linear gain of a level in decibels. */
export function dbToGain(db: number): number {
  return 10 ** (db / 20);
}

/** Mean of the channels, sample by sample. */
export function mixToMono(channels: readonly Float32Array[]): Float32Array {
  const [first] = channels;
  if (!first) return new Float32Array(0);
  const out = Float32Array.from(first);
  for (const channel of channels.slice(1)) {
    for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) + (channel[i] ?? 0);
  }
  if (channels.length > 1) for (let i = 0; i < out.length; i++) out[i] = (out[i] ?? 0) / channels.length;
  return out;
}

export interface TrimOptions {
  /** Linear level a sample must reach to count as sound (default -40 dBFS). */
  threshold?: number;
  /** Never trims more than this (default 1 s). */
  maxSeconds?: number;
}

/**
 * Cuts the silence before the first sample reaching the threshold. At most `maxSeconds` go, and at least one
 * sample stays (an empty buffer cannot become an AudioBuffer).
 */
export function trimLeadingSilence(
  samples: Float32Array,
  sampleRate: number,
  { threshold = dbToGain(-40), maxSeconds = 1 }: TrimOptions = {},
): Float32Array {
  const first = samples.findIndex((x) => Math.abs(x) >= threshold);
  const limit = Math.min(Math.round(maxSeconds * sampleRate), Math.max(0, samples.length - 1));
  return samples.slice(first === -1 ? limit : Math.min(first, limit));
}

export interface NormalizeOptions {
  /** Peak level to reach (default -1 dBFS). */
  targetDb?: number;
  /** Quiet recordings are amplified at most this much (default +30 dB), so noise is not blown up. */
  maxGainDb?: number;
}

/** Scales the signal so its peak is at `targetDb`; a silent signal stays silent. */
export function normalizePeak(
  samples: Float32Array,
  { targetDb = -1, maxGainDb = 30 }: NormalizeOptions = {},
): Float32Array {
  const peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
  if (peak === 0) return samples.slice();
  const gain = Math.min(dbToGain(targetDb) / peak, dbToGain(maxGainDb));
  return samples.map((x) => x * gain);
}

/** Linear fade to 0 over the last `seconds`, so a recording cut at an arbitrary point does not click. */
export function fadeOut(samples: Float32Array, sampleRate: number, seconds = 0.01): Float32Array {
  const fade = Math.max(1, Math.round(seconds * sampleRate));
  const last = samples.length - 1;
  return samples.map((x, i) => x * Math.min(1, (last - i) / fade));
}

/** The whole chain for a fresh recording: mono, leading silence trimmed, normalized, faded out. */
export function processRecording(channels: readonly Float32Array[], sampleRate: number): Float32Array {
  return fadeOut(normalizePeak(trimLeadingSilence(mixToMono(channels), sampleRate)), sampleRate);
}
