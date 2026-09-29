import type { Sound, SoundId } from '../core/model';
import type { SoundLoader } from './engine';
import { newRecordingSound } from './sounds';

/** The part of the app state that holds sounds; `AppState` fits, without `audio/` depending on it. */
export interface SoundState {
  readonly sounds: readonly Sound[];
  addSound(sound: Sound): void;
  removeSound(id: SoundId): void;
}

export interface RecordingsOptions {
  state: SoundState;
  engine: SoundLoader;
  /** Blob → processed mono buffer (`decodeRecording` on the app's audio context). */
  decode(blob: Blob): Promise<AudioBuffer>;
  /** Random part of new recording ids. */
  newKey?: () => string;
  /** Persistence (`Db`); optional so the app also runs without storage. */
  store?: RecordingStore;
}

/** Where recordings are persisted; `Db` from `storage/db.ts` fits. */
export interface RecordingStore {
  saveRecording(sound: Sound, blob: Blob): Promise<void>;
  deleteRecording(id: SoundId): Promise<void>;
}

export interface Recordings {
  /** Decodes a recording and makes it a sound: loaded into the engine, then listed in the state. */
  add(blob: Blob): Promise<Sound>;
  /** Deletes a recording (kit sounds and unknown ids are ignored); its squares turn silent. */
  remove(id: SoundId): void;
}

const randomKey = () => crypto.randomUUID().slice(0, 8);

/** Storage failures must not break recording: the sound still works for this session. */
const ignore = () => {};

export function createRecordings({
  state,
  engine,
  decode,
  newKey = randomKey,
  store,
}: RecordingsOptions): Recordings {
  /**
   * Storage writes per recording, chained: a delete pressed while the save is still running must land after it,
   * or the save would win and the deleted recording would come back after a reload.
   */
  const writes = new Map<SoundId, Promise<void>>();
  function queue(id: SoundId, write: () => Promise<void>): void {
    const next = (writes.get(id) ?? Promise.resolve()).then(write).catch(ignore);
    writes.set(id, next);
    void next.then(() => {
      if (writes.get(id) === next) writes.delete(id);
    });
  }

  return {
    async add(blob) {
      const buffer = await decode(blob);
      const sound = newRecordingSound(state.sounds, newKey());
      // Loaded first: the sound must be playable as soon as a square can use it.
      engine.load(sound.id, buffer);
      state.addSound(sound);
      // Not awaited: a slow write (or Safari's quota prompt) must not hold the Record button on "Saving…".
      if (store) queue(sound.id, () => store.saveRecording(sound, blob));
      return sound;
    },
    remove(id) {
      if (state.sounds.find((s) => s.id === id)?.source !== 'recording') return;
      state.removeSound(id);
      engine.unload(id);
      if (store) queue(id, () => store.deleteRecording(id));
    },
  };
}

/**
 * Decodes stored recordings and loads them into the engine under their saved ids. Returns the sounds that decoded,
 * in order; a recording that fails is skipped, and squares using it render silent.
 */
export async function restoreRecordings(
  stored: readonly { sound: Sound; blob: Blob }[],
  { decode, engine }: Pick<RecordingsOptions, 'decode' | 'engine'>,
): Promise<Sound[]> {
  const decoded = await Promise.all(
    stored.map(({ sound, blob }) =>
      // `then` first, so a decoder that throws synchronously is skipped like one that rejects.
      Promise.resolve()
        .then(() => decode(blob))
        .then(
          (buffer) => ({ sound, buffer }),
          () => null,
        ),
    ),
  );
  return decoded
    .filter((entry) => entry !== null)
    .map(({ sound, buffer }) => {
      engine.load(sound.id, buffer);
      return sound;
    });
}
