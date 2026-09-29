import { mount } from 'svelte';
import { RealtimeFakeEngine, WebAudioEngine, type FakeEngine } from './audio/engine';
import { renderKit } from './audio/kit';
import { createTransport, type Transport } from './audio/transport';
import App from './ui/App.svelte';
import { AppState, defaultSong, randomIdGen } from './state.svelte';
import './ui/global.css';

declare global {
  interface Window {
    /** e2e hook, only set with `?fake-audio`: what was scheduled, and the app state. */
    __seqTest?: { engine: FakeEngine; app: AppState };
  }
}

const target = document.getElementById('app');
if (!target) throw new Error('#app element missing');

const nextId = randomIdGen();
const app = new AppState({ song: defaultSong(nextId), nextId });

/**
 * Browsers start an AudioContext suspended until a user gesture. For touch, iOS only accepts `pointerup`/`touchend`
 * as a gesture, so keep trying on every candidate event until a resume succeeds.
 */
function unlockOnGesture(engine: WebAudioEngine): void {
  const events = ['pointerdown', 'pointerup', 'keydown'] as const;
  const stopListening = () => {
    for (const type of events) window.removeEventListener(type, unlock, true);
  };
  const unlock = () => {
    engine.unlock().then(stopListening, () => {
      // Not a gesture this browser accepts: the next one will retry.
    });
  };
  for (const type of events) window.addEventListener(type, unlock, true);
}

function audioTransport(): Transport {
  if (new URLSearchParams(location.search).has('fake-audio')) {
    const engine = new RealtimeFakeEngine();
    window.__seqTest = { engine, app };
    return createTransport({ engine, state: app });
  }
  // iOS 16.4+: play through the ring/silent switch like a music app instead of like a UI sound.
  const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
  if (session) session.type = 'playback';
  const engine = new WebAudioEngine();
  for (const [soundId, buffer] of renderKit(engine.context)) engine.load(soundId, buffer);
  unlockOnGesture(engine);
  return createTransport({ engine, state: app, unlock: () => engine.unlock() });
}

export default mount(App, { target, props: { app, transport: audioTransport() } });
