import type { SoundId } from '../core/model';

/** What the scheduler needs from an audio backend. Times are in the engine's clock (AudioContext seconds). */
export interface AudioEngine {
  now(): number;
  play(soundId: SoundId, when: number): void;
  /** Cancels every sound already scheduled or playing. */
  stopAll(): void;
}

/** Where decoded sounds go (recordings are added and removed at run time). */
export interface SoundLoader {
  load(soundId: SoundId, buffer: AudioBuffer): void;
  unload(soundId: SoundId): void;
}

/** Test double (unit tests, `?fake-audio` e2e): manual clock, records what would have played. */
export class FakeEngine implements AudioEngine, SoundLoader {
  time = 0;
  log: { soundId: SoundId; when: number }[] = [];
  stopAllCount = 0;
  /** Buffers loaded so far (the e2e reads recordings back from here). */
  readonly loaded = new Map<SoundId, AudioBuffer>();

  load(soundId: SoundId, buffer: AudioBuffer): void {
    this.loaded.set(soundId, buffer);
  }

  unload(soundId: SoundId): void {
    this.loaded.delete(soundId);
  }

  now(): number {
    return this.time;
  }

  advance(seconds: number): void {
    this.time += seconds;
  }

  play(soundId: SoundId, when: number): void {
    this.log.push({ soundId, when });
  }

  stopAll(): void {
    this.stopAllCount++;
  }
}

/** `FakeEngine` whose clock follows real time (`?fake-audio` e2e), so the scheduler advances in a browser. */
export class RealtimeFakeEngine extends FakeEngine {
  private readonly origin: number;

  /** `clockMs` returns milliseconds, like `performance.now()`. */
  constructor(private readonly clockMs: () => number = () => performance.now()) {
    super();
    this.origin = clockMs();
  }

  override now(): number {
    return (this.clockMs() - this.origin) / 1000;
  }
}

/** Master level: a few overlapping kit sounds at full scale would clip. */
const MASTER_GAIN = 0.8;

/** The real engine: plays loaded buffers on one `AudioContext`. */
export class WebAudioEngine implements AudioEngine, SoundLoader {
  private readonly master: GainNode;
  private readonly buffers = new Map<SoundId, AudioBuffer>();
  /** Sources started (possibly in the future) and not ended yet, so `stopAll` can cancel them. */
  private readonly live = new Set<AudioBufferSourceNode>();

  constructor(readonly context: AudioContext = new AudioContext()) {
    this.master = context.createGain();
    this.master.gain.value = MASTER_GAIN;
    this.master.connect(context.destination);
  }

  load(soundId: SoundId, buffer: AudioBuffer): void {
    this.buffers.set(soundId, buffer);
  }

  unload(soundId: SoundId): void {
    this.buffers.delete(soundId);
  }

  /** Resumes a suspended (or iOS-interrupted) context; the first call must happen inside a user gesture. */
  async unlock(): Promise<void> {
    if (this.context.state !== 'running') await this.context.resume();
  }

  now(): number {
    return this.context.currentTime;
  }

  play(soundId: SoundId, when: number): void {
    const buffer = this.buffers.get(soundId);
    if (!buffer) return;
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.master);
    source.onended = () => {
      this.live.delete(source);
      source.disconnect();
    };
    source.start(Math.max(0, when));
    this.live.add(source);
  }

  stopAll(): void {
    // Stopping a source whose start time is still in the future cancels it; `onended` then disconnects it.
    for (const source of this.live) source.stop();
    this.live.clear();
  }
}

const GESTURES = ['pointerdown', 'pointerup', 'keydown'] as const;

/**
 * Browsers start an AudioContext suspended until a user gesture, and for touch iOS only accepts `pointerup`/
 * `touchend` as one: try on every candidate event until the context actually runs.
 */
export function unlockOnGesture(engine: WebAudioEngine, target: EventTarget = window): void {
  const unlock = () => {
    engine.unlock().then(
      () => {
        if (engine.context.state !== 'running') return;
        for (const type of GESTURES) target.removeEventListener(type, unlock, true);
      },
      () => {
        // Not a gesture this browser accepts: the next one retries.
      },
    );
  };
  for (const type of GESTURES) target.addEventListener(type, unlock, true);
}
