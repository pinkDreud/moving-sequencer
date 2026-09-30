import type { NodeId, Song, Track } from '../core/model';
import { buildTimeline, leafAt, type Timeline } from '../core/timeline';
import type { AudioEngine } from './engine';
import { createScheduler, type Timer } from './scheduler';

/** What the transport reads and writes; `AppState` fits, without `audio/` depending on the state module. */
export interface TransportState {
  readonly song: Song;
  /** Index of the track on screen: the playhead is shown on that one. */
  readonly activeTrack: number;
  playing: boolean;
  playheadId: NodeId | null;
}

/** `requestAnimationFrame`/`cancelAnimationFrame` compatible; injected so tests render frames by hand. */
export interface FrameLoop {
  request(callback: () => void): unknown;
  cancel(handle: unknown): void;
}

export interface TransportOptions {
  engine: AudioEngine;
  state: TransportState;
  /** Resumes the audio clock; awaited before scheduling because a suspended context's time does not move. */
  unlock?: () => Promise<void>;
  timer?: Timer;
  frames?: FrameLoop;
}

export interface Transport {
  play(): Promise<void>;
  stop(): void;
  toggle(): Promise<void>;
}

const browserFrames: FrameLoop = {
  request: (callback) => requestAnimationFrame(callback),
  cancel: (handle) => cancelAnimationFrame(handle as number),
};

/** Play/stop for the song in `state`: drives the scheduler and keeps `state.playing`/`state.playheadId` current. */
export function createTransport({
  engine,
  state,
  unlock,
  timer,
  frames = browserFrames,
}: TransportOptions): Transport {
  const scheduler = createScheduler({ engine, getSong: () => state.song, timer });
  let frame: unknown;
  /** Bumped by every play/stop, so a play still waiting for `unlock` knows it was superseded. */
  let generation = 0;
  let memo: { track: Track; timeline: Timeline } | undefined;

  function timelineOf(track: Track): Timeline {
    if (memo?.track !== track) memo = { track, timeline: buildTimeline(track) };
    return memo.timeline;
  }

  function updatePlayhead(): void {
    const track = state.song.tracks[state.activeTrack];
    const position = scheduler.positionAt(engine.now(), state.activeTrack);
    const id = track && position !== null ? (leafAt(timelineOf(track), position)?.nodeId ?? null) : null;
    if (state.playheadId !== id) state.playheadId = id;
  }

  function onFrame(): void {
    updatePlayhead();
    frame = frames.request(onFrame);
  }

  async function play(): Promise<void> {
    if (state.playing) return;
    state.playing = true;
    const current = ++generation;
    if (unlock) {
      try {
        await unlock();
      } catch {
        // Start anyway: the clock stays still until a later gesture manages to resume the context.
      }
      if (current !== generation) return;
    }
    scheduler.start();
    onFrame();
  }

  function stop(): void {
    generation++;
    scheduler.stop();
    frames.cancel(frame);
    frame = undefined;
    state.playing = false;
    state.playheadId = null;
  }

  return {
    play,
    stop,
    async toggle() {
      if (state.playing) stop();
      else await play();
    },
  };
}
