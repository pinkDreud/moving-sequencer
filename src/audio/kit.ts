import type { SoundId } from '../core/model';
import { KIT } from './sounds';

/*
 * The built-in kit is synthesized sample by sample in plain JS rather than with an OfflineAudioContext: it is
 * small (a few ms of work), synchronous (ready before the first Play) and testable in jsdom, which has no Web Audio.
 */

const TAU = 2 * Math.PI;
/** Linear fade at the end of every sound, so cutting the buffer never clicks. */
const FADE_OUT = 0.01;

/** Seeded white noise in [-1, 1) (mulberry32): renders are reproducible, unlike `Math.random()`. */
function noise(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4294967296) * 2 - 1;
  };
}

/** Biquad filter from the RBJ audio EQ cookbook; returns a stateful per-sample processor. */
function biquad(
  type: 'highpass' | 'bandpass',
  frequency: number,
  q: number,
  sampleRate: number,
): (x: number) => number {
  // At or above Nyquist the coefficients make the filter unstable (low-rate contexts, e.g. 8 kHz headsets).
  const w0 = (TAU * Math.min(frequency, 0.45 * sampleRate)) / sampleRate;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * q);
  const [b0, b1, b2] = type === 'highpass' ? [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2] : [alpha, 0, -alpha];
  const [a0, a1, a2] = [1 + alpha, -2 * cos, 1 - alpha];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  return (x) => {
    const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    return y;
  };
}

/** Triangle wave with the phase of a sine: 0 at `cycles = 0`, peak 1 at a quarter cycle. */
function triangle(cycles: number): number {
  return 1 - 4 * Math.abs(((((cycles + 0.25) % 1) + 1) % 1) - 0.5);
}

const decay = (t: number, tau: number) => Math.exp(-t / tau);

/**
 * Renders `seconds` of `sample(t)` (called in time order, so it may keep filter/phase state), fades out the
 * tail and normalizes the peak to `level`.
 */
function render(
  sampleRate: number,
  seconds: number,
  level: number,
  sample: (t: number) => number,
): Float32Array {
  const length = Math.round(seconds * sampleRate);
  const fade = Math.round(FADE_OUT * sampleRate);
  const samples = Float32Array.from(
    { length },
    (_, i) => sample(i / sampleRate) * Math.min(1, (length - 1 - i) / fade),
  );
  const peak = samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
  return peak > 0 ? samples.map((x) => (x * level) / peak) : samples;
}

function kick(sampleRate: number): Float32Array {
  let phase = 0;
  return render(sampleRate, 0.45, 0.95, (t) => {
    // Pitch drop from ~160 Hz to ~48 Hz gives the thump.
    phase += (TAU * (48 + 110 * decay(t, 0.035))) / sampleRate;
    return Math.sin(phase) * decay(t, 0.13);
  });
}

function snare(sampleRate: number): Float32Array {
  const white = noise(1);
  const filter = biquad('highpass', 1500, 0.8, sampleRate);
  return render(sampleRate, 0.25, 0.8, (t) => {
    const body = (0.6 * Math.sin(TAU * 185 * t) + 0.3 * Math.sin(TAU * 330 * t)) * decay(t, 0.045);
    return 0.8 * filter(white()) * decay(t, 0.06) + body;
  });
}

function hat(sampleRate: number): Float32Array {
  const white = noise(2);
  const filter = biquad('highpass', 7000, 0.8, sampleRate);
  return render(sampleRate, 0.12, 0.5, (t) => filter(white()) * decay(t, 0.022));
}

function clap(sampleRate: number): Float32Array {
  const white = noise(3);
  const filter = biquad('bandpass', 1100, 1.5, sampleRate);
  const burst = 0.012;
  const tailStart = 3 * burst;
  return render(sampleRate, 0.4, 0.7, (t) => {
    // Three quick hand claps, then the room tail.
    const envelope = t < tailStart ? decay(t % burst, 0.005) : 0.8 * decay(t - tailStart, 0.1);
    return filter(white()) * envelope;
  });
}

function rim(sampleRate: number): Float32Array {
  return render(sampleRate, 0.08, 0.6, (t) => {
    const click = 0.7 * triangle(1700 * t) + 0.5 * Math.sin(TAU * 520 * t);
    return click * decay(t, 0.012);
  });
}

function tone(frequency: number): (sampleRate: number) => Float32Array {
  return (sampleRate) =>
    render(sampleRate, 0.6, 0.5, (t) => {
      const attack = Math.min(1, t / 0.005);
      const wave = 0.8 * Math.sin(TAU * frequency * t) + 0.2 * triangle(frequency * t);
      return wave * attack * decay(t, 0.22);
    });
}

const RENDERERS = new Map<SoundId, (sampleRate: number) => Float32Array>([
  ['kick', kick],
  ['snare', snare],
  ['hat', hat],
  ['clap', clap],
  ['rim', rim],
  ['tone-low', tone(220)],
  ['tone-mid', tone(440)],
  ['tone-high', tone(880)],
]);

/** Mono samples (≤ 1 s, peak ≤ 1) of a built-in kit sound, or `undefined` for an unknown id. */
export function renderSound(id: SoundId, sampleRate: number): Float32Array | undefined {
  return RENDERERS.get(id)?.(sampleRate);
}

/** Renders every kit sound into a mono `AudioBuffer` at the context's sample rate. */
export function renderKit(
  context: Pick<BaseAudioContext, 'sampleRate' | 'createBuffer'>,
): Map<SoundId, AudioBuffer> {
  const buffers = new Map<SoundId, AudioBuffer>();
  for (const { id } of KIT) {
    const samples = renderSound(id, context.sampleRate);
    if (!samples) continue;
    const buffer = context.createBuffer(1, samples.length, context.sampleRate);
    buffer.getChannelData(0).set(samples);
    buffers.set(id, buffer);
  }
  return buffers;
}
