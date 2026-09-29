import { describe, expect, it, vi } from 'vitest';
import { dbToGain } from './sampleOps';
import {
  decodeRecording,
  MicError,
  micAvailability,
  startRecording,
  type MicDeps,
  type RecorderHandlers,
} from './recorder';

class FakeTrack {
  stopped = false;
  stop() {
    this.stopped = true;
  }
}

class FakeStream {
  readonly tracks = [new FakeTrack(), new FakeTrack()];
  getTracks() {
    return this.tracks;
  }
}

class FakeRecorder {
  started = false;
  stopCalls = 0;
  mimeType = 'audio/webm;codecs=opus';
  constructor(
    readonly stream: FakeStream,
    readonly handlers: RecorderHandlers,
  ) {}
  start() {
    this.started = true;
  }
  stop() {
    this.stopCalls++;
  }
  /** What the browser does (asynchronously) after `stop()`: the last data, then `stop`. */
  finish(chunks: Blob[]) {
    for (const chunk of chunks) this.handlers.ondata(chunk);
    this.handlers.onstop();
  }
}

function fakeTimer() {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  return {
    pending,
    setTimeout(callback: () => void, ms: number) {
      pending.set(next, { callback, ms });
      return next++;
    },
    clearTimeout(handle: unknown) {
      pending.delete(handle as number);
    },
    fireAll() {
      const due = [...pending.values()];
      pending.clear();
      for (const { callback } of due) callback();
    },
  };
}

function mic(overrides: Partial<MicDeps<FakeStream>> = {}) {
  const stream = new FakeStream();
  const recorders: FakeRecorder[] = [];
  const timer = fakeTimer();
  const getUserMedia = vi.fn((_constraints: MediaStreamConstraints) => Promise.resolve(stream));
  const deps: MicDeps<FakeStream> = {
    getUserMedia,
    createRecorder: (s, handlers) => {
      const recorder = new FakeRecorder(s, handlers);
      recorders.push(recorder);
      return recorder;
    },
    timer,
    ...overrides,
  };
  const recorder = () => {
    const r = recorders[0];
    if (!r) throw new Error('no recorder created');
    return r;
  };
  return { deps, stream, recorder, timer, getUserMedia };
}

const blobText = (blob: Blob) => blob.text();

describe('micAvailability', () => {
  const apis = { mediaDevices: { getUserMedia: () => {} }, MediaRecorder: class {} };

  it('is ok in a secure context with getUserMedia and MediaRecorder', () => {
    expect(micAvailability({ isSecureContext: true, ...apis })).toBe('ok');
  });

  it('is insecure outside a secure context, whatever the APIs', () => {
    expect(micAvailability({ isSecureContext: false, ...apis })).toBe('insecure');
    expect(micAvailability({ isSecureContext: false })).toBe('insecure');
  });

  it('is unsupported without mediaDevices, getUserMedia or MediaRecorder', () => {
    expect(micAvailability({ isSecureContext: true, MediaRecorder: apis.MediaRecorder })).toBe('unsupported');
    expect(
      micAvailability({ isSecureContext: true, mediaDevices: {}, MediaRecorder: apis.MediaRecorder }),
    ).toBe('unsupported');
    expect(micAvailability({ isSecureContext: true, mediaDevices: apis.mediaDevices })).toBe('unsupported');
  });
});

describe('startRecording', () => {
  it('asks for audio without call processing and starts recording', async () => {
    const { deps, recorder, getUserMedia } = mic();
    await startRecording(deps);
    expect(getUserMedia).toHaveBeenCalledWith({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
    });
    expect(recorder().started).toBe(true);
  });

  it('on stop, resolves with one Blob of the recorded chunks and releases the mic', async () => {
    const { deps, recorder, stream } = mic();
    const recording = await startRecording(deps);
    expect(stream.tracks.some((t) => t.stopped)).toBe(false);
    recording.stop();
    expect(recorder().stopCalls).toBe(1);
    recorder().finish([new Blob(['ab']), new Blob([]), new Blob(['cd'])]);
    const blob = await recording.result;
    expect(blob.type).toBe('audio/webm;codecs=opus');
    expect(await blobText(blob)).toBe('abcd');
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('stops by itself after 4 s', async () => {
    const { deps, recorder, timer } = mic();
    const recording = await startRecording(deps);
    expect([...timer.pending.values()].map((p) => p.ms)).toEqual([4000]);
    timer.fireAll();
    expect(recorder().stopCalls).toBe(1);
    recording.stop(); // a late user stop does nothing more
    expect(recorder().stopCalls).toBe(1);
  });

  it('takes another limit, and a user stop cancels the automatic one', async () => {
    const { deps, timer } = mic();
    const recording = await startRecording(deps, 2);
    expect([...timer.pending.values()].map((p) => p.ms)).toEqual([2000]);
    recording.stop();
    expect([...timer.pending.values()].map((p) => p.ms)).toEqual([2000]); // only the stop watchdog is left
  });

  it('fails and releases the mic when stopping the recorder throws (older Safari, inactive recorder)', async () => {
    const audioSession = { type: 'playback' };
    const { deps, recorder, stream } = mic({ audioSession });
    const recording = await startRecording(deps);
    recorder().stop = () => {
      throw new DOMException('inactive', 'InvalidStateError');
    };
    expect(() => recording.stop()).not.toThrow();
    await expect(recording.result).rejects.toMatchObject({ reason: 'failed' });
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
    expect(audioSession.type).toBe('playback');
  });

  it('the automatic stop does not throw either when stopping the recorder fails', async () => {
    const { deps, recorder, timer } = mic();
    const recording = await startRecording(deps);
    recorder().stop = () => {
      throw new DOMException('inactive', 'InvalidStateError');
    };
    expect(() => timer.fireAll()).not.toThrow();
    await expect(recording.result).rejects.toMatchObject({ reason: 'failed' });
  });

  it('gives up 2 s after a stop that the recorder never confirms, releasing the mic', async () => {
    const { deps, stream, timer } = mic();
    const recording = await startRecording(deps);
    recording.stop();
    timer.fireAll(); // the watchdog: no stop event came
    await expect(recording.result).rejects.toMatchObject({ reason: 'failed' });
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('clears the watchdog once the recorder confirms the stop', async () => {
    const { deps, recorder, timer } = mic();
    const recording = await startRecording(deps);
    recording.stop();
    recorder().finish([new Blob(['x'])]);
    await recording.result;
    expect(timer.pending.size).toBe(0);
  });

  it.each([
    ['NotAllowedError', 'denied'],
    ['SecurityError', 'denied'],
    ['NotFoundError', 'no-mic'],
    ['OverconstrainedError', 'no-mic'],
    ['NotReadableError', 'failed'],
  ])('maps a getUserMedia %s to the reason %s', async (name, reason) => {
    const { deps } = mic({ getUserMedia: () => Promise.reject(new DOMException('nope', name)) });
    const error = await startRecording(deps).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MicError);
    expect((error as MicError).reason).toBe(reason);
  });

  it('maps anything else thrown by getUserMedia to failed', async () => {
    const { deps } = mic({ getUserMedia: () => Promise.reject(new Error('boom')) });
    await expect(startRecording(deps)).rejects.toMatchObject({ reason: 'failed' });
  });

  it('releases the mic and fails when the recorder cannot start', async () => {
    const { deps, stream } = mic({
      createRecorder: () => {
        throw new Error('unsupported mime type');
      },
    });
    await expect(startRecording(deps)).rejects.toMatchObject({ reason: 'failed' });
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
  });

  it('rejects the result and releases the mic when the recorder reports an error', async () => {
    const { deps, recorder, stream, timer } = mic();
    const recording = await startRecording(deps);
    recorder().handlers.onerror(new Error('device lost'));
    await expect(recording.result).rejects.toMatchObject({ reason: 'failed' });
    expect(stream.tracks.every((t) => t.stopped)).toBe(true);
    expect(timer.pending.size).toBe(0);
  });

  it('switches the iOS audio session to play-and-record while recording, then back', async () => {
    const audioSession = { type: 'playback' };
    const { deps, recorder, getUserMedia } = mic({ audioSession });
    getUserMedia.mockImplementation(() => {
      expect(audioSession.type).toBe('play-and-record');
      return Promise.resolve(new FakeStream());
    });
    const recording = await startRecording(deps);
    expect(audioSession.type).toBe('play-and-record');
    recording.stop();
    recorder().finish([new Blob(['x'])]);
    await recording.result;
    expect(audioSession.type).toBe('playback');
  });

  it('restores the audio session after a recorder error, even when stop follows the error', async () => {
    const audioSession = { type: 'playback' };
    const { deps, recorder } = mic({ audioSession });
    const recording = await startRecording(deps);
    recorder().handlers.onerror(new Error('device lost'));
    recorder().handlers.onstop(); // browsers fire stop after error
    await expect(recording.result).rejects.toMatchObject({ reason: 'failed' });
    expect(audioSession.type).toBe('playback');
  });

  it('restores the audio session when the recorder cannot start', async () => {
    const audioSession = { type: 'playback' };
    const { deps } = mic({
      audioSession,
      createRecorder: () => {
        throw new Error('unsupported');
      },
    });
    await expect(startRecording(deps)).rejects.toBeInstanceOf(MicError);
    expect(audioSession.type).toBe('playback');
  });

  it('restores the audio session when the permission is denied', async () => {
    const audioSession = { type: 'playback' };
    const { deps } = mic({
      audioSession,
      getUserMedia: () => Promise.reject(new DOMException('nope', 'NotAllowedError')),
    });
    await expect(startRecording(deps)).rejects.toBeInstanceOf(MicError);
    expect(audioSession.type).toBe('playback');
  });
});

class FakeBuffer {
  constructor(
    readonly channels: Float32Array[],
    readonly sampleRate: number,
  ) {}
  get numberOfChannels() {
    return this.channels.length;
  }
  get length() {
    return this.channels[0]?.length ?? 0;
  }
  getChannelData(i: number) {
    const channel = this.channels[i];
    if (!channel) throw new Error(`no channel ${i}`);
    return channel;
  }
}

describe('decodeRecording', () => {
  function context(decoded: FakeBuffer | Error) {
    const decodeAudioData = vi.fn((_data: ArrayBuffer) =>
      decoded instanceof Error ? Promise.reject(decoded) : Promise.resolve(decoded),
    );
    const createBuffer = vi.fn(
      (channels: number, length: number, sampleRate: number) =>
        new FakeBuffer(
          Array.from({ length: channels }, () => new Float32Array(length)),
          sampleRate,
        ),
    );
    // The fake implements the part of BaseAudioContext that decodeRecording uses.
    return { decodeAudioData, createBuffer } as unknown as Pick<
      BaseAudioContext,
      'decodeAudioData' | 'createBuffer'
    > & { decodeAudioData: typeof decodeAudioData };
  }

  it('decodes the blob bytes into a processed mono buffer at the decoded sample rate', async () => {
    const tone = (level: number) => {
      const out = new Float32Array(500);
      for (let i = 300; i < 500; i++) out[i] = i % 2 ? level : -level;
      return out;
    };
    const ctx = context(new FakeBuffer([tone(0.2), tone(0.1)], 1000));
    const buffer = (await decodeRecording(
      new Blob([new Uint8Array([1, 2, 3])]),
      ctx,
    )) as unknown as FakeBuffer;
    const bytes = ctx.decodeAudioData.mock.calls[0]?.[0];
    expect(bytes && [...new Uint8Array(bytes)]).toEqual([1, 2, 3]);
    expect(buffer.numberOfChannels).toBe(1);
    expect(buffer.sampleRate).toBe(1000);
    expect(buffer.length).toBe(200);
    const peak = buffer.getChannelData(0).reduce((m, x) => Math.max(m, Math.abs(x)), 0);
    expect(peak).toBeCloseTo(dbToGain(-1), 5);
  });

  it('rejects when the audio cannot be decoded', async () => {
    const ctx = context(new Error('EncodingError'));
    await expect(decodeRecording(new Blob([]), ctx)).rejects.toThrow('EncodingError');
  });
});
