// @vitest-environment node
import 'fake-indexeddb/auto';
import { createStore, get, set, type UseStore } from 'idb-keyval';
import { afterEach, describe, expect, it } from 'vitest';
import { group, square, type Song, type Sound } from '../core/model';
import { createDb, openDb } from './db';

let dbCount = 0;
/** A fresh, empty IndexedDB store per test. */
const freshStore = () => createStore(`test-${++dbCount}`, 'data');

const song = (): Song => ({
  version: 1,
  bpm: 97,
  slotValue: 16,
  tracks: [
    { id: 't', nodes: [square('a', 'kick'), group('g', [square('b', null), square('c', 'rec-a', true)])] },
  ],
});

const rec = (id: string, name: string): Sound => ({ id, name, color: '#fff', source: 'recording' });

function clock(start = 1) {
  let now = start;
  return () => now++;
}

describe('createDb', () => {
  it('saves the song under "song" and loads it back', async () => {
    const store = freshStore();
    const db = createDb(store);
    await db.saveSong(song());
    expect(await get('song', store)).toEqual(song());
    expect(await db.loadSong()).toEqual(song());
  });

  it('loads null when there is no song', async () => {
    expect(await createDb(freshStore()).loadSong()).toBeNull();
  });

  it('loads null for an invalid or future song', async () => {
    const store = freshStore();
    await set('song', { ...song(), version: 2 }, store);
    expect(await createDb(store).loadSong()).toBeNull();
    await set('song', 'garbage', store);
    expect(await createDb(store).loadSong()).toBeNull();
  });

  it('normalizes a loaded song', async () => {
    const store = freshStore();
    await set('song', { ...song(), tracks: [{ id: 't', nodes: [group('g', [square('b', null)])] }] }, store);
    expect((await createDb(store).loadSong())?.tracks[0]?.nodes).toEqual([square('b', null)]);
  });

  it('saves a recording under "recording:<id>" and loads it back as a Blob with its sound', async () => {
    const store = freshStore();
    const db = createDb(store, clock());
    await db.saveRecording(
      rec('rec-a', 'Rec 1'),
      new Blob([new Uint8Array([1, 2, 3])], { type: 'audio/webm' }),
    );
    expect(await get('recording:rec-a', store)).toBeDefined();
    const [loaded, ...others] = await db.loadRecordings();
    expect(others).toEqual([]);
    expect(loaded?.sound).toEqual(rec('rec-a', 'Rec 1'));
    expect(loaded?.blob.type).toBe('audio/webm');
    expect([...new Uint8Array((await loaded?.blob.arrayBuffer()) ?? new ArrayBuffer(0))]).toEqual([1, 2, 3]);
  });

  it('loads recordings in the order they were saved, whatever their ids', async () => {
    const db = createDb(freshStore(), clock());
    await db.saveRecording(rec('rec-z', 'Rec 1'), new Blob(['1']));
    await db.saveRecording(rec('rec-a', 'Rec 2'), new Blob(['2']));
    await db.saveRecording(rec('rec-m', 'Rec 3'), new Blob(['3']));
    expect((await db.loadRecordings()).map((r) => r.sound.name)).toEqual(['Rec 1', 'Rec 2', 'Rec 3']);
  });

  it('skips invalid recordings and ignores other keys', async () => {
    const store = freshStore();
    const db = createDb(store, clock());
    await db.saveSong(song());
    await db.saveRecording(rec('rec-a', 'Rec 1'), new Blob(['1']));
    await set('recording:rec-bad', { sound: 'nope' }, store);
    expect((await db.loadRecordings()).map((r) => r.sound.id)).toEqual(['rec-a']);
  });

  it('deletes a recording', async () => {
    const store = freshStore();
    const db = createDb(store, clock());
    await db.saveRecording(rec('rec-a', 'Rec 1'), new Blob(['1']));
    await db.deleteRecording('rec-a');
    expect(await get('recording:rec-a', store)).toBeUndefined();
    expect(await db.loadRecordings()).toEqual([]);
  });

  it('rejects when the song cannot be read, so a failed read is not mistaken for "no song"', async () => {
    const broken: UseStore = () => Promise.reject(new Error('blocked'));
    await expect(createDb(broken).loadSong()).rejects.toThrow('blocked');
  });

  it('loads no recordings, without throwing, when the store fails', async () => {
    const broken: UseStore = () => Promise.reject(new Error('blocked'));
    expect(await createDb(broken).loadRecordings()).toEqual([]);
  });

  it('skips a recording stored under another id, and loads a duplicated id once', async () => {
    const store = freshStore();
    const db = createDb(store, clock());
    await db.saveRecording(rec('rec-a', 'Rec 1'), new Blob(['1']));
    const record = await get<Record<string, unknown>>('recording:rec-a', store);
    await set('recording:rec-b', record, store); // sound.id rec-a under the key of rec-b
    expect((await db.loadRecordings()).map((r) => r.sound.id)).toEqual(['rec-a']);
  });
});

describe('openDb', () => {
  const original = globalThis.indexedDB;
  afterEach(() => {
    Object.defineProperty(globalThis, 'indexedDB', { configurable: true, writable: true, value: original });
  });

  it('opens a working store', async () => {
    const db = await openDb({ store: freshStore });
    expect(db).not.toBeNull();
    await db?.saveSong(song());
    expect(await db?.loadSong()).toEqual(song());
  });

  it('opens the app store by default', async () => {
    expect(await openDb()).not.toBeNull();
  });

  it('is null without IndexedDB', async () => {
    // @ts-expect-error: simulating a browser without IndexedDB
    delete globalThis.indexedDB;
    expect(await openDb()).toBeNull();
  });

  it('is null when reading indexedDB throws (storage blocked)', async () => {
    Object.defineProperty(globalThis, 'indexedDB', {
      configurable: true,
      get() {
        throw new DOMException('blocked', 'SecurityError');
      },
    });
    await expect(openDb()).resolves.toBeNull();
  });

  it('is null when creating the store throws', async () => {
    const store = () => {
      throw new Error('InvalidStateError');
    };
    await expect(openDb({ store })).resolves.toBeNull();
  });

  it('is null when the store fails or hangs', async () => {
    expect(await openDb({ store: () => () => Promise.reject(new Error('blocked')) })).toBeNull();
    expect(await openDb({ store: () => () => new Promise(() => {}), timeoutMs: 1 })).toBeNull();
  });
});
