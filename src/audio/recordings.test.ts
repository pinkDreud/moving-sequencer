import { describe, expect, it, vi } from 'vitest';
import type { Sound, SoundId } from '../core/model';
import { createIdGen } from '../core/model';
import { FakeEngine } from './engine';
import { createRecordings, restoreRecordings } from './recordings';
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

describe('createRecordings with a store', () => {
  function withStore(
    store = {
      saveRecording: vi.fn(() => Promise.resolve()),
      deleteRecording: vi.fn(() => Promise.resolve()),
    },
  ) {
    const state = fakeState();
    const engine = new FakeEngine();
    const decode = vi.fn((_blob: Blob) => Promise.resolve(buffer(1)));
    const recordings = createRecordings({ state, engine, decode, newKey: createIdGen('k'), store });
    return { state, engine, recordings, store };
  }

  it('saves a new recording with its blob', async () => {
    const { recordings, store } = withStore();
    const blob = new Blob(['x']);
    const sound = await recordings.add(blob);
    expect(store.saveRecording).toHaveBeenCalledWith(sound, blob);
  });

  it('deletes a removed recording from the store', async () => {
    const { recordings, store } = withStore();
    const sound = await recordings.add(new Blob(['x']));
    recordings.remove(sound.id);
    expect(store.deleteRecording).toHaveBeenCalledWith(sound.id);
  });

  it('keeps the sound for this session when the store fails', async () => {
    const failing = {
      saveRecording: vi.fn(() => Promise.reject(new Error('QuotaExceededError'))),
      deleteRecording: vi.fn(() => Promise.reject(new Error('blocked'))),
    };
    const { state, recordings } = withStore(failing);
    const sound = await recordings.add(new Blob(['x']));
    expect(state.sounds.at(-1)).toBe(sound);
    expect(() => recordings.remove(sound.id)).not.toThrow();
    await Promise.resolve();
  });
});

describe('restoreRecordings', () => {
  it('decodes and loads each stored recording under its id and returns their sounds in order', async () => {
    const engine = new FakeEngine();
    const a: Sound = { id: 'rec-a', name: 'Rec 1', color: '#fff', source: 'recording' };
    const b: Sound = { id: 'rec-b', name: 'Rec 2', color: '#eee', source: 'recording' };
    const decode = vi.fn((blob: Blob) => Promise.resolve(buffer(blob.size)));
    const sounds = await restoreRecordings(
      [
        { sound: a, blob: new Blob(['1']) },
        { sound: b, blob: new Blob(['22']) },
      ],
      { decode, engine },
    );
    expect(sounds).toEqual([a, b]);
    expect(engine.loaded.get('rec-a')).toEqual(buffer(1));
    expect(engine.loaded.get('rec-b')).toEqual(buffer(2));
  });

  it('skips a recording that fails to decode', async () => {
    const engine = new FakeEngine();
    const a: Sound = { id: 'rec-a', name: 'Rec 1', color: '#fff', source: 'recording' };
    const b: Sound = { id: 'rec-b', name: 'Rec 2', color: '#eee', source: 'recording' };
    const decode = vi.fn((blob: Blob) =>
      blob.size === 1 ? Promise.reject(new Error('EncodingError')) : Promise.resolve(buffer(2)),
    );
    const sounds = await restoreRecordings(
      [
        { sound: a, blob: new Blob(['1']) },
        { sound: b, blob: new Blob(['22']) },
      ],
      { decode, engine },
    );
    expect(sounds).toEqual([b]);
    expect(engine.loaded.has('rec-a')).toBe(false);
  });
});
