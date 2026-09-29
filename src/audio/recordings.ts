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
  return {
    async add(blob) {
      const buffer = await decode(blob);
      const sound = newRecordingSound(state.sounds, newKey());
      // Loaded first: the sound must be playable as soon as a square can use it.
      engine.load(sound.id, buffer);
      state.addSound(sound);
      await store?.saveRecording(sound, blob).catch(ignore);
      return sound;
    },
    remove(id) {
      if (state.sounds.find((s) => s.id === id)?.source !== 'recording') return;
      state.removeSound(id);
      engine.unload(id);
      store?.deleteRecording(id).catch(ignore);
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
      decode(blob).then(
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
