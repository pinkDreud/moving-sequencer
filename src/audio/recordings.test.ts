import { describe, expect, it, vi } from 'vitest';
import type { Sound, SoundId } from '../core/model';
import { createIdGen } from '../core/model';
import { FakeEngine } from './engine';
import { createRecordings } from './recordings';
import { KIT } from './sounds';

function fakeState() {
  return {
    sounds: KIT as readonly Sound[],
    removed: [] as SoundId[],
    addSound(sound: Sound) {
      this.sounds = [...this.sounds, sound];
    },
    removeSound(id: SoundId) {
      this.removed.push(id);
      this.sounds = this.sounds.filter((s) => s.id !== id);
    },
  };
}

const buffer = (duration: number) => ({ duration }) as unknown as AudioBuffer;

function setup(decode = vi.fn((_blob: Blob) => Promise.resolve(buffer(1)))) {
  const state = fakeState();
  const engine = new FakeEngine();
  const recordings = createRecordings({ state, engine, decode, newKey: createIdGen('k') });
  return { state, engine, recordings, decode };
}

describe('createRecordings', () => {
  it('add decodes the blob, loads the buffer into the engine and adds "Rec 1" to the sounds', async () => {
    const { state, engine, recordings, decode } = setup();
    const blob = new Blob(['x']);
    const sound = await recordings.add(blob);
    expect(decode).toHaveBeenCalledWith(blob);
    expect(sound).toMatchObject({ id: 'rec-k1', name: 'Rec 1', source: 'recording' });
    expect(engine.loaded.get('rec-k1')).toEqual(buffer(1));
    expect(state.sounds.at(-1)).toBe(sound);
  });

  it('numbers successive recordings', async () => {
    const { state, recordings } = setup();
    await recordings.add(new Blob(['a']));
    await recordings.add(new Blob(['b']));
    expect(state.sounds.slice(KIT.length).map((s) => [s.id, s.name])).toEqual([
      ['rec-k1', 'Rec 1'],
      ['rec-k2', 'Rec 2'],
    ]);
  });

  it('adds nothing when decoding fails', async () => {
    const { state, engine, recordings } = setup(vi.fn(() => Promise.reject(new Error('EncodingError'))));
    await expect(recordings.add(new Blob([]))).rejects.toThrow('EncodingError');
    expect(state.sounds).toBe(KIT);
    expect(engine.loaded.size).toBe(0);
  });

  it('remove deletes a recording from the state and unloads its buffer', async () => {
    const { state, engine, recordings } = setup();
    const sound = await recordings.add(new Blob(['a']));
    recordings.remove(sound.id);
    expect(state.removed).toEqual([sound.id]);
    expect(engine.loaded.has(sound.id)).toBe(false);
  });

  it('remove ignores kit sounds and unknown ids', () => {
    const { state, recordings } = setup();
    recordings.remove('kick');
    recordings.remove('rec-nope');
    expect(state.removed).toEqual([]);
    expect(state.sounds).toBe(KIT);
  });
});
