// IndexedDB persistence through idb-keyval. Keys: `song` (the Song object) and `recording:<id>` (RecordingRecord).
import { createStore, del, entries, get, set, type UseStore } from 'idb-keyval';
import type { Song, Sound, SoundId } from '../core/model';
import { parseRecordingRecord, parseSong, type RecordingRecord } from './validate';

const SONG_KEY = 'song';
const RECORDING_PREFIX = 'recording:';

export interface StoredRecording {
  sound: Sound;
  blob: Blob;
}

export interface Db {
  saveSong(song: Song): Promise<void>;
  /** The saved song, validated and normalized; null when there is none, it is invalid, or reading fails. */
  loadSong(): Promise<Song | null>;
  saveRecording(sound: Sound, blob: Blob): Promise<void>;
  /** Valid saved recordings, oldest first; empty when reading fails. */
  loadRecordings(): Promise<StoredRecording[]>;
  deleteRecording(id: SoundId): Promise<void>;
}

/** Storage on an idb-keyval store. `clock` orders the recordings (milliseconds, like `Date.now`). */
export function createDb(store: UseStore, clock: () => number = () => Date.now()): Db {
  return {
    saveSong: (song) => set(SONG_KEY, song, store),
    async loadSong() {
      try {
        return parseSong(await get<unknown>(SONG_KEY, store));
      } catch {
        return null;
      }
    },
    async saveRecording(sound, blob) {
      // Bytes, not the Blob: older Safari could not store Blobs in IndexedDB.
      const record: RecordingRecord = {
        sound,
        type: blob.type,
        data: await blob.arrayBuffer(),
        savedAt: clock(),
      };
      await set(RECORDING_PREFIX + sound.id, record, store);
    },
    async loadRecordings() {
      let all: [IDBValidKey, unknown][];
      try {
        all = await entries<IDBValidKey, unknown>(store);
      } catch {
        return [];
      }
      return all
        .filter(([key]) => typeof key === 'string' && key.startsWith(RECORDING_PREFIX))
        .map(([, value]) => parseRecordingRecord(value))
        .filter((record) => record !== null)
        .sort((a, b) => a.savedAt - b.savedAt)
        .map(({ sound, type, data }) => ({ sound, blob: new Blob([data], { type }) }));
    },
    deleteRecording: (id) => del(RECORDING_PREFIX + id, store),
  };
}

export interface OpenDbOptions {
  /** Creates the store (default: database `moving-sequencer`, object store `data`). */
  store?: () => UseStore;
  /** A blocked database can leave requests pending forever; give up after this long. */
  timeoutMs?: number;
}

/**
 * Opens the app's storage and checks that it answers. Null when IndexedDB is missing (old browsers), throws
 * (some private modes) or hangs: the app then runs without saving.
 */
export async function openDb({
  store: makeStore = () => createStore('moving-sequencer', 'data'),
  timeoutMs = 2000,
}: OpenDbOptions = {}): Promise<Db | null> {
  if (typeof indexedDB === 'undefined' || indexedDB === null) return null;
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const store = makeStore();
    const probe = get(SONG_KEY, store).then(() => true);
    const expired = new Promise<false>((resolve) => (timeout = setTimeout(() => resolve(false), timeoutMs)));
    return (await Promise.race([probe, expired])) ? createDb(store) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
