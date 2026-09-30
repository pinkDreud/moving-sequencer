import type { Song, Track } from '../core/model';
import { buildTimeline, EPSILON, type Timeline } from '../core/timeline';
import { secondsPerSlot, unwarp, warp } from '../core/timing';
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
  /**
   * Slot position heard at audio `time` in track `trackIndex` (default: the master), in `[0, length)`; `null`
   * when stopped or when that track has nothing playable.
   */
  positionAt(time: number, trackIndex?: number): number | null;
}

/** Safety net against runaway work: a tick never crosses more loop ends than this, whatever the tempo. */
const MAX_LOOPS_PER_TICK = 1000;

/** A free-running track's place in time: the slot position scheduled up to, and its audio time. */
interface Voice {
  /** Unwarped (a position in the pattern); swing only changes how slot distances turn into seconds. */
  cursor: number;
  cursorTime: number;
  /** Audio time of the first event when the voice started at slot 0; before it the position is 0. */
  startTime: number;
}

interface PlannedTrack {
  id: string;
  timeline: Timeline;
  /** Loop-synced to a playable master: scheduled inside the master's windows instead of running free. */
  follows: boolean;
}

/** One master window: swung master positions `[from, end)`, `from` sounding at audio `time`. */
interface Window {
  from: number;
  end: number;
  time: number;
}

const browserTimer: Timer = {
  setInterval: (callback, ms) => setInterval(callback, ms),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>),
};

/**
 * Lookahead scheduler (PLAN §2.4, feature 17): plays all the tracks of the song in a loop, re-reading the song
 * on every tick. The master and the slot-synced tracks run free, each with its own cursor; loop-synced tracks
 * are placed inside the master's loop.
 */
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
  /** Free-running tracks by track id. */
  const voices = new Map<string, Voice>();
  /** Audio time scheduled up to by the last tick (at start: the first event); where a lone new voice begins. */
  let frontier = 0;
  // Ops are immutable, so an unchanged track object means an unchanged timeline.
  const timelines = new WeakMap<Track, Timeline>();

  function timelineOf(track: Track): Timeline {
    let timeline = timelines.get(track);
    if (!timeline) timelines.set(track, (timeline = buildTimeline(track)));
    return timeline;
  }

  function plan(): { sps: number; swing: number; tracks: PlannedTrack[] } | null {
    const song = getSong();
    const sps = secondsPerSlot(song.bpm, song.slotValue, song.tempoFactor);
    if (!(sps > 0 && Number.isFinite(sps))) return null;
    const tracks = song.tracks.map((track) => ({ track, timeline: timelineOf(track) }));
    const masterPlays = (tracks[0]?.timeline.length ?? 0) > 0;
    return {
      sps,
      swing: song.swing ?? 0,
      tracks: tracks.map(({ track, timeline }, i) => ({
        id: track.id,
        timeline,
        // With an empty master there is no loop to fit: the track runs free at the slot duration.
        follows: i > 0 && track.sync === 'loop' && masterPlays,
      })),
    };
  }

  const runsFree = (track: PlannedTrack) => !track.follows && track.timeline.length > 0;

  /** Schedules the leaves of loop-synced `track` that fall inside a window of a master `masterLength` long. */
  function scheduleFollower(
    { timeline }: PlannedTrack,
    masterLength: number,
    window: Window,
    sps: number,
    swing: number,
  ): void {
    const scale = masterLength / timeline.length;
    for (const leaf of timeline.leaves) {
      if (!leaf.audible || leaf.soundId === null) continue;
      // Where the leaf sounds, as a swung master position; its swing pairs the track's own slots.
      const at = warp(leaf.start, swing, timeline.length) * scale;
      if (at >= window.from - EPSILON && at < window.end - EPSILON)
        engine.play(leaf.soundId, window.time + (at - window.from) * sps);
    }
  }

  /** Schedules a free-running track up to `horizon`, reporting each window it goes through. */
  function advance(
    voice: Voice,
    { length, leaves }: Timeline,
    { now, horizon, sps, swing }: { now: number; horizon: number; sps: number; swing: number },
    onWindow?: (window: Window) => void,
  ): void {
    const swung = (position: number) => warp(position, swing, length);
    const unswung = (time: number) => unwarp(time, swing, length);
    voice.cursor %= length;
    if (voice.cursorTime < now) {
      // Late tick (throttled tab, main-thread jank): drop what should already have played rather than
      // playing it in a burst; the position keeps following time.
      voice.cursor = unswung((swung(voice.cursor) + (now - voice.cursorTime) / sps) % length);
      voice.cursorTime = now;
    }
    for (let loops = 0; voice.cursorTime < horizon && loops < MAX_LOOPS_PER_TICK;) {
      const { cursor, cursorTime } = voice;
      // Seconds map linearly to swung slots; the window itself stays in (unwarped) pattern positions, so
      // everything below is the straight algorithm with `swung(p) − from` in place of `p − cursor`.
      const from = swung(cursor);
      const end = unswung(Math.min(from + (horizon - cursorTime) / sps, length));
      // Both bounds shifted by -EPSILON: consecutive windows partition the loop, so a leaf whose start is
      // within float error of a window boundary is scheduled exactly once.
      for (const leaf of leaves) {
        if (
          leaf.audible &&
          leaf.soundId !== null &&
          leaf.start >= cursor - EPSILON &&
          leaf.start < end - EPSILON
        )
          engine.play(leaf.soundId, cursorTime + (swung(leaf.start) - from) * sps);
      }
      // `swung(end)` is recomputed from `end` as the next window's `from`, so follower windows partition too.
      onWindow?.({ from, end: swung(end), time: cursorTime });
      if (end < length) {
        voice.cursor = end;
        voice.cursorTime = horizon;
      } else {
        voice.cursorTime += (length - from) * sps;
        voice.cursor = 0;
        loops++;
      }
    }
  }

  function tick(): void {
    if (!playing) return;
    const now = engine.now();
    const horizon = now + lookahead;
    const planned = plan();
    const free = planned?.tracks.filter(runsFree) ?? [];
    for (const id of voices.keys()) if (!free.some((track) => track.id === id)) voices.delete(id);
    if (planned) {
      const { sps, swing } = planned;
      // A track that starts while others run joins their slot grid: it takes the place, modulo its own length,
      // of the first track already running (read before anything advances).
      const running = free.find((track) => voices.has(track.id));
      const reference = running && voices.get(running.id);
      const joinAt = reference && running ? { ...reference, length: running.timeline.length } : undefined;
      for (const track of free) {
        if (voices.has(track.id)) continue;
        voices.set(
          track.id,
          joinAt
            ? {
                // In swung slots: whole slots are where the tracks' grids agree, whatever pair each is in.
                cursor: unwarp(
                  warp(joinAt.cursor % joinAt.length, swing, joinAt.length) % track.timeline.length,
                  swing,
                  track.timeline.length,
                ),
                cursorTime: joinAt.cursorTime,
                startTime: -Infinity,
              }
            : { cursor: 0, cursorTime: frontier, startTime: frontier },
        );
      }
      const master = planned.tracks[0];
      const followers = planned.tracks.filter((track) => track.follows && track.timeline.length > 0);
      for (const track of free) {
        const voice = voices.get(track.id);
        if (!voice) continue;
        const onWindow =
          track === master && followers.length > 0
            ? (window: Window) => {
                for (const follower of followers)
                  scheduleFollower(follower, track.timeline.length, window, sps, swing);
              }
            : undefined;
        advance(voice, track.timeline, { now, horizon, sps, swing }, onWindow);
      }
    }
    frontier = Math.max(frontier, horizon);
  }

  return {
    tick,
    get isPlaying() {
      return playing;
    },
    start() {
      if (playing) return;
      playing = true;
      voices.clear();
      frontier = engine.now() + startOffset;
      handle = timer.setInterval(tick, interval * 1000);
      tick();
    },
    stop() {
      if (!playing) return;
      playing = false;
      timer.clearInterval(handle);
      engine.stopAll();
    },
    positionAt(time, trackIndex = 0) {
      const planned = playing ? plan() : null;
      const track = planned?.tracks[trackIndex];
      if (!planned || !track || track.timeline.length === 0) return null;
      const { sps, swing } = planned;
      /** Swung position of a free-running track at `time`; 0 until its voice exists and its first event. */
      const swungAt = ({ id, timeline: { length } }: PlannedTrack): number => {
        const voice = voices.get(id);
        if (!voice || time < voice.startTime) return 0;
        // `cursor` may still be past a pattern that just shrank; the next tick would wrap it the same way.
        const time0 = warp(voice.cursor % length, swing, length) - (voice.cursorTime - time) / sps;
        return ((time0 % length) + length) % length;
      };
      const { length } = track.timeline;
      const master = planned.tracks[0];
      const swung =
        track.follows && master ? (swungAt(master) * length) / master.timeline.length : swungAt(track);
      const position = unwarp(swung, swing, length);
      // A float result a hair below `length` is really the loop start.
      return position > length - EPSILON ? 0 : position;
    },
  };
}
