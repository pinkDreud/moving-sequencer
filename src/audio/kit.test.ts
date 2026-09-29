import { describe, expect, it } from 'vitest';
import { renderKit, renderSound } from './kit';
import { KIT } from './sounds';

const peak = (samples: Float32Array) => samples.reduce((max, x) => Math.max(max, Math.abs(x)), 0);
const rms = (samples: Float32Array) => Math.sqrt(samples.reduce((sum, x) => sum + x * x, 0) / samples.length);

/** Just enough of `AudioBuffer` for `renderKit`: one Float32Array per channel. */
class FakeBuffer {
  readonly channels: Float32Array[];
  constructor(
    readonly numberOfChannels: number,
    readonly length: number,
    readonly sampleRate: number,
  ) {
    this.channels = Array.from({ length: numberOfChannels }, () => new Float32Array(length));
  }
  getChannelData(channel: number): Float32Array {
    const data = this.channels[channel];
    if (!data) throw new Error(`no channel ${channel}`);
    return data;
  }
}

function fakeContext(sampleRate: number) {
  const created: FakeBuffer[] = [];
  const context = {
    sampleRate,
    createBuffer(channels: number, length: number, rate: number) {
      const buffer = new FakeBuffer(channels, length, rate);
      created.push(buffer);
      // The fake implements the part of AudioBuffer that renderKit uses.
      return buffer as unknown as AudioBuffer;
    },
  };
  return { context, created };
}

describe('renderSound', () => {
  describe.each(KIT.map((sound) => sound.id))('%s', (id) => {
    // Low rates happen too (e.g. a Bluetooth headset in call mode): filters must stay stable there.
    for (const sampleRate of [8000, 16000, 22050, 44100, 48000, 96000]) {
      it(`is non-silent, at most 1 s and within [-1, 1] at ${sampleRate} Hz`, () => {
        const samples = renderSound(id, sampleRate);
        expect(samples).toBeInstanceOf(Float32Array);
        if (!samples) return;
        expect(samples.length).toBeGreaterThan(0);
        expect(samples.length).toBeLessThanOrEqual(sampleRate);
        expect(samples.every(Number.isFinite)).toBe(true);
        expect(peak(samples)).toBeLessThanOrEqual(1);
        expect(peak(samples)).toBeGreaterThan(0.1);
        expect(rms(samples)).toBeGreaterThan(0.005);
      });
    }

    it('ends at silence, so the buffer end does not click', () => {
      const samples = renderSound(id, 44100);
      expect(Math.abs(samples?.at(-1) ?? 1)).toBeLessThan(1e-3);
    });

    it('is deterministic', () => {
      expect(renderSound(id, 44100)).toEqual(renderSound(id, 44100));
    });
  });

  it('returns undefined for an unknown sound id', () => {
    expect(renderSound('cowbell', 44100)).toBeUndefined();
  });

  it('gives each sound its own character (no two kit sounds are identical)', () => {
    const rendered = KIT.map((sound) => renderSound(sound.id, 44100));
    for (let i = 0; i < rendered.length; i++)
      for (let j = i + 1; j < rendered.length; j++) expect(rendered[i]).not.toEqual(rendered[j]);
  });

  it('pitches the tones low < mid < high', () => {
    // Zero crossings over the first 0.1 s grow with pitch.
    const crossings = (id: string) => {
      const samples = renderSound(id, 44100)?.subarray(0, 4410) ?? new Float32Array();
      let n = 0;
      for (let i = 1; i < samples.length; i++) if ((samples[i - 1] ?? 0) < 0 !== (samples[i] ?? 0) < 0) n++;
      return n;
    };
    expect(crossings('tone-low')).toBeLessThan(crossings('tone-mid'));
    expect(crossings('tone-mid')).toBeLessThan(crossings('tone-high'));
  });
});

describe('renderKit', () => {
  it('creates one mono buffer per kit sound at the context sample rate, filled with the rendered samples', () => {
    const { context, created } = fakeContext(48000);
    const kit = renderKit(context);
    expect([...kit.keys()]).toEqual(KIT.map((sound) => sound.id));
    expect(created).toHaveLength(KIT.length);
    for (const sound of KIT) {
      const buffer = kit.get(sound.id) as unknown as FakeBuffer;
      expect(buffer.numberOfChannels).toBe(1);
      expect(buffer.sampleRate).toBe(48000);
      expect(buffer.getChannelData(0)).toEqual(renderSound(sound.id, 48000));
    }
  });
});
