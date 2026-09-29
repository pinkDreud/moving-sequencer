import { mount } from 'svelte';
import {
  RealtimeFakeEngine,
  unlockOnGesture,
  WebAudioEngine,
  type FakeEngine,
  type SoundLoader,
} from './audio/engine';
import { renderKit } from './audio/kit';
import { browserMic, decodeRecording, micAvailability, startRecording } from './audio/recorder';
import { createRecordings } from './audio/recordings';
import { createTransport, type Transport } from './audio/transport';
import App from './ui/App.svelte';
import { RecordControl } from './ui/recordControl.svelte';
import { AppState, defaultSong, randomIdGen } from './state.svelte';
import './ui/global.css';

declare global {
  interface Window {
    /** e2e hook, only set with `?fake-audio`: what was scheduled and loaded, and the app state. */
    __seqTest?: { engine: FakeEngine; app: AppState };
  }
}

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

const nextId = randomIdGen();
const app = new AppState({ song: defaultSong(nextId), nextId });

interface Audio {
  transport: Transport;
  loader: SoundLoader;
  decode(blob: Blob): Promise<AudioBuffer>;
}

function setupAudio(): Audio {
  if (new URLSearchParams(location.search).has('fake-audio')) {
    const engine = new RealtimeFakeEngine();
    window.__seqTest = { engine, app };
    // Nothing plays, but recordings still go through the browser's real decoder.
    let offline: OfflineAudioContext | undefined;
    const decode = (blob: Blob) => decodeRecording(blob, (offline ??= new OfflineAudioContext(1, 1, 48_000)));
    return { transport: createTransport({ engine, state: app }), loader: engine, decode };
  }
  // iOS 16.4+: play through the ring/silent switch like a music app instead of like a UI sound.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  const engine = new WebAudioEngine();
  for (const [soundId, buffer] of renderKit(engine.context)) engine.load(soundId, buffer);
  unlockOnGesture(engine);
  return {
    transport: createTransport({ engine, state: app, unlock: () => engine.unlock() }),
    loader: engine,
    decode: (blob) => decodeRecording(blob, engine.context),
  };
}

const audio = setupAudio();
const recordings = createRecordings({ state: app, engine: audio.loader, decode: audio.decode });
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

export default mount(App, { target, props: { app, transport: audio.transport, recording } });
