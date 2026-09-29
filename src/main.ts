import { mount } from 'svelte';
import {
  RealtimeFakeEngine,
  unlockOnGesture,
  WebAudioEngine,
  type AudioEngine,
  type FakeEngine,
  type SoundLoader,
} from './audio/engine';
import { renderKit } from './audio/kit';
import { browserMic, decodeRecording, micAvailability, startRecording } from './audio/recorder';
import { createRecordings, restoreRecordings } from './audio/recordings';
import { KIT } from './audio/sounds';
import type { Song, Sound } from './core/model';
import { createTransport } from './audio/transport';
import { RecordControl } from './recordControl.svelte';
import { AppState, defaultSong, randomIdGen, watchSong } from './state.svelte';
import { createAutosave, flushOnHide } from './storage/autosave';
import { openDb, type Db } from './storage/db';
import { watchForUpdates } from './pwaUpdate';
import { UpdateStatus } from './updateStatus.svelte';
import App from './ui/App.svelte';
import './ui/global.css';

declare global {
  interface Window {
    /** e2e hook, only set with `?fake-audio`: what was scheduled and loaded, and the app state. */
    __seqTest?: { engine: FakeEngine; app: AppState };
  }
}

interface Audio {
  engine: AudioEngine & SoundLoader;
  fake?: FakeEngine;
  unlock?: () => Promise<void>;
  decode(blob: Blob): Promise<AudioBuffer>;
}

function setupAudio(): Audio {
  if (new URLSearchParams(location.search).has('fake-audio')) {
    const engine = new RealtimeFakeEngine();
    // Nothing plays, but recordings still go through the browser's real decoder.
    let offline: OfflineAudioContext | undefined;
    const decode = (blob: Blob) => decodeRecording(blob, (offline ??= new OfflineAudioContext(1, 1, 48_000)));
    return { engine, fake: engine, decode };
  }
  // iOS 16.4+: play through the ring/silent switch like a music app instead of like a UI sound.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  const engine = new WebAudioEngine();
  for (const [soundId, buffer] of renderKit(engine.context)) engine.load(soundId, buffer);
  unlockOnGesture(engine);
  return { engine, unlock: () => engine.unlock(), decode: (blob) => decodeRecording(blob, engine.context) };
}

interface Loaded {
  db: Db | null;
  song: Song | null;
  recordings: Sound[];
}

/** Recordings first (so the saved song finds its sounds), then the song. */
async function load(audio: Audio): Promise<Loaded> {
  const db = await openDb();
  if (!db) return { db: null, song: null, recordings: [] };
  const recordings = await restoreRecordings(await db.loadRecordings(), audio);
  try {
    return { db, song: await db.loadSong(), recordings };
  } catch {
    // The song exists but could not be read: run without saving, so the default song never overwrites it.
    return { db: null, song: null, recordings };
  }
}

/**
 * Startup: load, then mount. Mounting after loading means no flash of the default pattern and no edit lost to a
 * late load. With `storage: false` (or when storage fails) the app starts on the default song, without saving.
 */
async function start(target: HTMLElement, audio: Audio, storage = true): Promise<void> {
  const {
    db,
    song: saved,
    recordings: restored,
  } = storage ? await load(audio) : { db: null, song: null, recordings: [] };
  const nextId = randomIdGen();
  const song = saved ?? defaultSong(nextId);
  const app = new AppState({ song, nextId, sounds: [...KIT, ...restored] });
  if (audio.fake) window.__seqTest = { engine: audio.fake, app };

  if (db) {
    const autosave = createAutosave({ save: (s) => db.saveSong(s), saved: song });
    watchSong(app, (s) => autosave.update(s));
    flushOnHide(autosave);
  }

  const recordings = createRecordings({
    state: app,
    engine: audio.engine,
    decode: audio.decode,
    store: db ?? undefined,
  });
  const recording = new RecordControl({
    availability: micAvailability({
      isSecureContext: window.isSecureContext,
      // Typed as always present, but browsers leave these out where they cannot record.
      mediaDevices: navigator.mediaDevices as unknown,
      MediaRecorder: (globalThis as { MediaRecorder?: unknown }).MediaRecorder,
    }),
    start: () => startRecording(browserMic()),
    save: (blob) => recordings.add(blob),
    remove: (id) => recordings.remove(id),
  });
  const transport = createTransport({ engine: audio.engine, state: app, unlock: audio.unlock });
  const update = new UpdateStatus();
  // Production only: the dev server has no service worker.
  if (import.meta.env.PROD) {
    watchForUpdates({
      sw: navigator.serviceWorker,
      doc: document,
      url: `${import.meta.env.BASE_URL}sw.js`,
      scope: import.meta.env.BASE_URL,
      onUpdate: () => (update.ready = true),
    });
  }
  mount(App, { target, props: { app, transport, recording, update } });
}

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');
const audio = setupAudio();
// Stored data drives the first render: if anything in it still breaks startup, start clean rather than blank.
start(target, audio).catch((error: unknown) => {
  console.error('Startup with saved data failed; starting without saving.', error);
  target.replaceChildren();
  void start(target, audio, false);
});
