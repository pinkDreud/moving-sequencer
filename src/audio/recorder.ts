// Mic capture (getUserMedia + MediaRecorder → Blob) and decoding of a recording into a mono AudioBuffer.
// The browser APIs are injected (`MicDeps`) so the flow is unit-tested with fakes; `browserMic` wires the real ones.
import { processRecording } from './sampleOps';

/** Recordings stop by themselves after this long. */
export const MAX_RECORDING_SECONDS = 4;

/** How long a stopped recorder may take to deliver its data before we give up. */
const STOP_WATCHDOG_MS = 2000;

export type MicAvailability = 'ok' | 'insecure' | 'unsupported';

/** Whether recording can work here. Browsers hide `mediaDevices` outside secure contexts (plain-HTTP LAN). */
export function micAvailability(env: {
  isSecureContext: boolean;
  mediaDevices?: unknown;
  MediaRecorder?: unknown;
}): MicAvailability {
  if (!env.isSecureContext) return 'insecure';
  const { mediaDevices } = env;
  const hasGetUserMedia =
    typeof mediaDevices === 'object' &&
    mediaDevices !== null &&
    'getUserMedia' in mediaDevices &&
    typeof mediaDevices.getUserMedia === 'function';
  return hasGetUserMedia && typeof env.MediaRecorder === 'function' ? 'ok' : 'unsupported';
}

export type MicErrorReason = 'denied' | 'no-mic' | 'failed';

export class MicError extends Error {
  constructor(
    readonly reason: MicErrorReason,
    options?: { cause?: unknown },
  ) {
    super(`microphone: ${reason}`, options);
    this.name = 'MicError';
  }
}

function reasonOf(error: unknown): MicErrorReason {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : undefined;
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'no-mic';
  return 'failed';
}

export interface MediaStreamLike {
  getTracks(): { stop(): void }[];
}

export interface RecorderHandlers {
  ondata(blob: Blob): void;
  onstop(): void;
  onerror(error: unknown): void;
}

export interface MediaRecorderLike {
  start(): void;
  stop(): void;
  readonly mimeType: string;
}

export interface MicDeps<S extends MediaStreamLike = MediaStreamLike> {
  getUserMedia(constraints: MediaStreamConstraints): Promise<S>;
  createRecorder(stream: S, handlers: RecorderHandlers): MediaRecorderLike;
  timer?: { setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
  /** iOS 16.4+ `navigator.audioSession`: `playback` (set at startup) does not allow capture. */
  audioSession?: { type: string };
}

export interface Recording {
  /** Stops early; the result follows once the recorder has flushed its data. */
  stop(): void;
  /** The recorded audio, or a `MicError('failed')` if the recorder broke down. */
  readonly result: Promise<Blob>;
}

// We record instruments and noises, not calls: the voice processing would gate and colour them.
const CONSTRAINTS: MediaStreamConstraints = {
  audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
};

const browserTimer = {
  setTimeout: (callback: () => void, ms: number): unknown => setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Opens the mic and starts recording; rejects with a `MicError` when the mic cannot be opened (permission, no
 * device). The recording stops after `maxSeconds`, and the mic is released as soon as it stops.
 */
export async function startRecording<S extends MediaStreamLike>(
  deps: MicDeps<S>,
  maxSeconds = MAX_RECORDING_SECONDS,
): Promise<Recording> {
  const { audioSession, timer = browserTimer } = deps;
  const previousSession = audioSession?.type;
  if (audioSession) audioSession.type = 'play-and-record';
  const restoreSession = () => {
    if (audioSession && previousSession !== undefined) audioSession.type = previousSession;
  };

  let stream: S;
  try {
    stream = await deps.getUserMedia(CONSTRAINTS);
  } catch (error) {
    restoreSession();
    throw new MicError(reasonOf(error), { cause: error });
  }

  const chunks: Blob[] = [];
  let settle: { resolve(blob: Blob): void; reject(error: unknown): void } | undefined;
  const result = new Promise<Blob>((resolve, reject) => (settle = { resolve, reject }));
  let recorder: MediaRecorderLike | undefined;
  /** Stopped by the user, the time limit or an error: later stops do nothing. */
  let stopped = false;
  let watchdog: unknown;
  let released = false;
  const release = () => {
    if (released) return;
    released = true;
    stopped = true;
    timer.clearTimeout(autoStop);
    timer.clearTimeout(watchdog);
    for (const track of stream.getTracks()) track.stop();
    restoreSession();
  };
  const fail = (error: unknown) => {
    release();
    settle?.reject(new MicError('failed', { cause: error }));
  };
  const stop = () => {
    if (stopped) return;
    stopped = true;
    timer.clearTimeout(autoStop);
    try {
      recorder?.stop();
    } catch (error) {
      // Older Safari throws InvalidStateError when the recorder already went inactive.
      fail(error);
      return;
    }
    // Never leave the mic open and the button on "Stop" if the browser does not confirm the stop.
    watchdog = timer.setTimeout(() => fail(new Error('the recorder did not stop')), STOP_WATCHDOG_MS);
  };
  const autoStop = timer.setTimeout(stop, maxSeconds * 1000);

  try {
    const created = deps.createRecorder(stream, {
      ondata: (blob) => {
        if (blob.size > 0) chunks.push(blob);
      },
      onstop: () => {
        release();
        settle?.resolve(new Blob(chunks, { type: created.mimeType || chunks[0]?.type || '' }));
      },
      onerror: fail,
    });
    created.start();
    recorder = created;
  } catch (error) {
    release();
    throw new MicError('failed', { cause: error });
  }
  return { stop, result };
}

/** The real browser APIs for `startRecording`. */
export function browserMic(): MicDeps<MediaStream> {
  const { audioSession } = navigator as Navigator & { audioSession?: { type: string } };
  return {
    getUserMedia: (constraints) => navigator.mediaDevices.getUserMedia(constraints),
    createRecorder: (stream, { ondata, onstop, onerror }) => {
      const recorder = new MediaRecorder(stream);
      recorder.addEventListener('dataavailable', (event) => ondata(event.data));
      recorder.addEventListener('stop', () => onstop());
      recorder.addEventListener('error', (event) => onerror(event));
      return recorder;
    },
    audioSession,
  };
}

export type DecodeContext = Pick<BaseAudioContext, 'decodeAudioData' | 'createBuffer'>;

/** Decodes a recording and turns it into a mono, trimmed, normalized buffer at the decoded sample rate. */
export async function decodeRecording(blob: Blob, context: DecodeContext): Promise<AudioBuffer> {
  const decoded = await context.decodeAudioData(await blob.arrayBuffer());
  const channels = Array.from({ length: decoded.numberOfChannels }, (_, i) => decoded.getChannelData(i));
  const samples = processRecording(channels, decoded.sampleRate);
  const buffer = context.createBuffer(1, samples.length, decoded.sampleRate);
  buffer.getChannelData(0).set(samples);
  return buffer;
}
