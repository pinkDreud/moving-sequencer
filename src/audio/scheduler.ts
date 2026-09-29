import type { Song, Track } from '../core/model';
import { buildTimeline, EPSILON, type Timeline } from '../core/timeline';
import { secondsPerSlot } from '../core/timing';
import type { AudioEngine } from './engine';

/** `setInterval`/`clearInterval` compatible; injected so tests drive ticks by hand. */
export interface Timer {
  setInterval(callback: () => void, ms: number): unknown;
  clearInterval(handle: unknown): void;
}

export interface SchedulerOptions {
  engine: AudioEngine;
  /** Called on every tick: live edits are heard because the song is never cached here. */
  getSong: () => Song;
  timer?: Timer;
  /** Seconds scheduled ahead of `engine.now()`. */
  lookahead?: number;
  /** Seconds between ticks. */
  interval?: number;
  /** Delay before the first event, so it is not already late when handed to the engine. */
  startOffset?: number;
}

export interface Scheduler {
  start(): void;
  stop(): void;
  tick(): void;
  readonly isPlaying: boolean;
  /** Slot position heard at audio `time`, in `[0, length)`; `null` when stopped or nothing is playable. */
  positionAt(time: number): number | null;
}

/** Safety net against runaway work: a tick never crosses more loop ends than this, whatever the tempo. */
const MAX_LOOPS_PER_TICK = 1000;

const EMPTY: Timeline = { length: 0, leaves: [] };

const browserTimer: Timer = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/** Lookahead scheduler (PLAN §2.4): plays `song.tracks[0]` in a loop, re-reading the song on every tick. */
export function createScheduler({
  engine,
  getSong,
  timer = browserTimer,
  lookahead = 0.1,
  interval = 0.025,
  startOffset = 0.05,
}: SchedulerOptions): Scheduler {
  let playing = false;
  let handle: unknown;
  let startTime = 0;
  /** Slot position scheduled up to, and the audio time it corresponds to. */
  let cursor = 0;
  let cursorTime = 0;
  let memo: { track: Track; timeline: Timeline } | undefined;

  function timelineOf(track: Track | undefined): Timeline {
    if (!track) return EMPTY;
    // Ops are immutable, so an unchanged track object means an unchanged timeline.
    if (memo?.track !== track) memo = { track, timeline: buildTimeline(track) };
    return memo.timeline;
  }

  function playable(): { timeline: Timeline; sps: number } | null {
    const song = getSong();
    const timeline = timelineOf(song.tracks[0]);
    const sps = secondsPerSlot(song.bpm, song.slotValue);
    return timeline.length > 0 && sps > 0 && Number.isFinite(sps) ? { timeline, sps } : null;
  }

  function tick(): void {
    if (!playing) return;
    const now = engine.now();
    const horizon = now + lookahead;
    const state = playable();
    if (!state) {
      cursor = 0;
      cursorTime = Math.max(cursorTime, horizon);
      return;
    }
    const { timeline, sps } = state;
    const { length, leaves } = timeline;
    cursor %= length;
    if (cursorTime < now) {
      // Late tick (throttled tab, main-thread jank): drop what should already have played rather than
      // playing it in a burst; the position keeps following time.
      cursor = (cursor + (now - cursorTime) / sps) % length;
      cursorTime = now;
    }
    for (let loops = 0; cursorTime < horizon && loops < MAX_LOOPS_PER_TICK;) {
      const end = Math.min(cursor + (horizon - cursorTime) / sps, length);
      // Both bounds shifted by -EPSILON: consecutive windows partition the loop, so a leaf whose start is
      // within float error of a window boundary is scheduled exactly once.
      for (const leaf of leaves) {
        if (
          leaf.audible &&
          leaf.soundId !== null &&
          leaf.start >= cursor - EPSILON &&
          leaf.start < end - EPSILON
        )
          engine.play(leaf.soundId, cursorTime + (leaf.start - cursor) * sps);
      }
      if (end < length) {
        cursor = end;
        cursorTime = horizon;
      } else {
        cursorTime += (length - cursor) * sps;
        cursor = 0;
        loops++;
      }
    }
  }

  return {
    tick,
    get isPlaying() {
      return playing;
    },
    start() {
      if (playing) return;
      playing = true;
      cursor = 0;
      cursorTime = startTime = engine.now() + startOffset;
      handle = timer.setInterval(tick, interval * 1000);
      tick();
    },
    stop() {
      if (!playing) return;
      playing = false;
      timer.clearInterval(handle);
      engine.stopAll();
    },
    positionAt(time) {
      const state = playing ? playable() : null;
      if (!state) return null;
      if (time < startTime) return 0;
      const { length } = state.timeline;
      const position = (((cursor - (cursorTime - time) / state.sps) % length) + length) % length;
      // A float result a hair below `length` is really the loop start.
      return position > length - EPSILON ? 0 : position;
    },
  };
}
