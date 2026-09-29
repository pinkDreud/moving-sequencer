import {
  MAX_RECORDING_SECONDS,
  MicError,
  type MicAvailability,
  type MicErrorReason,
  type Recording,
} from './audio/recorder';
import type { SoundId } from './core/model';

export type RecordStatus = 'idle' | 'starting' | 'recording' | 'processing';

export interface RecordControlDeps {
  availability: MicAvailability;
  /** Opens the mic and starts recording (`startRecording`); rejects with a `MicError`. */
  start(): Promise<Recording>;
  /** Turns the recorded blob into a sound (`Recordings.add`); rejects when it cannot be decoded. */
  save(blob: Blob): Promise<unknown>;
  /** Deletes a recorded sound (`Recordings.remove`). */
  remove(id: SoundId): void;
  /** Milliseconds, like `performance.now()`. */
  clock?: () => number;
  interval?: { set(callback: () => void, ms: number): unknown; clear(handle: unknown): void };
}

const START_MESSAGES: Record<MicErrorReason, string> = {
  denied: 'Microphone permission denied',
  'no-mic': 'No microphone found',
  failed: 'Could not start the microphone',
};

const HINTS: Record<MicAvailability, string | null> = {
  ok: null,
  insecure: 'Needs HTTPS',
  unsupported: 'Recording not supported in this browser',
};

/** How often the elapsed time on the Stop button is refreshed. */
const TICK_MS = 100;

const browserInterval = {
  set: (callback: () => void, ms: number): unknown => setInterval(callback, ms),
  clear: (handle: unknown) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** State and actions behind the palette's Record button and the recordings' delete buttons. */
export class RecordControl {
  status: RecordStatus = $state('idle');
  /** Seconds recorded so far, while recording. */
  elapsed = $state(0);
  /** Last error, shown inline until the next press. */
  message: string | null = $state(null);
  readonly availability: MicAvailability;
  private session: Recording | undefined;
  private stopRequested = false;
  /** Bumped by every start and cancel, so a start that resolves after a cancel knows it is stale. */
  private generation = 0;

  constructor(private readonly deps: RecordControlDeps) {
    this.availability = deps.availability;
  }

  /** Why recording is unavailable, or null. */
  get hint(): string | null {
    return HINTS[this.availability];
  }

  get disabled(): boolean {
    return this.availability !== 'ok' || this.status === 'processing';
  }

  /**
   * Record; Cancel while waiting for the mic (a permission prompt may never be answered); Stop while recording.
   * Resolves when the whole recording has been handled.
   */
  async toggle(): Promise<void> {
    if (this.status === 'recording') {
      if (!this.stopRequested) this.session?.stop();
      this.stopRequested = true;
      return;
    }
    if (this.status === 'starting') {
      this.generation++;
      this.status = 'idle';
      return;
    }
    if (this.disabled) return;
    const generation = ++this.generation;
    this.message = null;
    this.status = 'starting';
    let session: Recording;
    try {
      session = await this.deps.start();
    } catch (error) {
      if (generation !== this.generation) return;
      this.message = START_MESSAGES[error instanceof MicError ? error.reason : 'failed'];
      this.status = 'idle';
      return;
    }
    if (generation !== this.generation) {
      // Cancelled while the mic was opening: close it again and drop whatever it recorded.
      session.stop();
      session.result.catch(() => {});
      return;
    }
    this.session = session;
    this.stopRequested = false;
    this.status = 'recording';
    const stopTicking = this.countElapsed();
    try {
      let blob: Blob;
      try {
        blob = await session.result;
      } catch {
        this.message = 'Recording failed';
        return;
      } finally {
        stopTicking();
      }
      this.status = 'processing';
      try {
        await this.deps.save(blob);
      } catch {
        this.message = 'Could not read the recording';
      }
    } finally {
      this.session = undefined;
      this.elapsed = 0;
      this.status = 'idle';
    }
  }

  remove(id: SoundId): void {
    this.deps.remove(id);
  }

  private countElapsed(): () => void {
    const { clock = () => performance.now(), interval = browserInterval } = this.deps;
    const startedAt = clock();
    this.elapsed = 0;
    const handle = interval.set(() => {
      this.elapsed = Math.min(MAX_RECORDING_SECONDS, (clock() - startedAt) / 1000);
    }, TICK_MS);
    return () => interval.clear(handle);
  }
}
