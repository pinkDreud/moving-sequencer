import { describe, expect, it } from 'vitest';
import { group, square, type SeqNode, type Song, type Track, type TrackSync } from '../core/model';
import { FakeEngine } from './engine';
import { createScheduler } from './scheduler';

const [a, b, c, d] = [square('a', 'a'), square('b', 'b'), square('c', 'c'), square('d', 'd')] as const;
const [x, y, z, w] = [square('x', 'x'), square('y', 'y'), square('z', 'z'), square('w', 'w')] as const;

const track = (id: string, nodes: SeqNode[], sync?: TrackSync): Track =>
  sync ? { id, nodes, sync } : { id, nodes };

/** 120 bpm, eighth-note slots → 0.25 s per master slot; the first event lands at 0.05 s. */
function setup(tracks: Track[]) {
  const engine = new FakeEngine();
  let song: Song = { version: 1, bpm: 120, slotValue: 8, tracks };
  const timer = { setInterval: () => 'handle', clearInterval: () => {} };
  const scheduler = createScheduler({ engine, getSong: () => song, timer });
  const tickAt = (time: number) => {
    engine.time = time;
    scheduler.tick();
  };
  return {
    engine,
    scheduler,
    /** Ticks every 25 ms, the last tick landing exactly on `time`. */
    runUntil(time: number) {
      for (let t = engine.time + 0.025; t < time - 1e-12; t += 0.025) tickAt(t);
      tickAt(time);
    },
    edit(patch: Partial<Song>) {
      song = { ...song, ...patch };
    },
    /** What was scheduled for these sounds, in time order. */
    events(...sounds: string[]) {
      return engine.log
        .filter(({ soundId }) => sounds.includes(soundId))
        .sort((p, q) => p.when - q.when)
        .map(({ soundId, when }) => `${soundId}@${when.toFixed(3)}`);
    },
  };
}

const MASTER = ['a', 'b', 'c', 'd'];
const OTHER = ['x', 'y', 'z', 'w'];

describe('tracks sharing the slot', () => {
  it('plays every track at the master slot duration, each looping at its own length', () => {
    const s = setup([track('m', [a, b, c, d]), track('t', [x, y, z])]);
    s.scheduler.start();
    s.runUntil(1);
    expect(s.events(...MASTER)).toEqual(['a@0.050', 'b@0.300', 'c@0.550', 'd@0.800', 'a@1.050']);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.300', 'z@0.550', 'x@0.800', 'y@1.050']);
  });

  it('plays groups and skips muted and silent squares in every track', () => {
    const s = setup([
      track('m', [a, b]),
      track('t', [x, group('g', [y, z]), square('q', 'q', true), square('r', null)]),
    ]);
    s.scheduler.start();
    s.runUntil(1);
    expect(s.events(...OTHER, 'q')).toEqual(['x@0.050', 'y@0.300', 'z@0.425', 'x@1.050']);
  });

  it('swings the pairs of each track', () => {
    const s = setup([track('m', [a, b]), track('t', [x, y, z, w])]);
    s.edit({ swing: 0.5 });
    s.scheduler.start();
    s.runUntil(1);
    expect(s.events(...MASTER)).toEqual(['a@0.050', 'b@0.425', 'a@0.550', 'b@0.925', 'a@1.050']);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.425', 'z@0.550', 'w@0.925', 'x@1.050']);
  });

  it('plays the other tracks while the master is empty', () => {
    const s = setup([track('m', []), track('t', [x, y])]);
    s.scheduler.start();
    s.runUntil(0.5);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.300', 'x@0.550']);
  });

  it('starts a track that gets its first square mid-play on the slot grid of the running tracks', () => {
    const master = track('m', [a, b, c, d]);
    const s = setup([master, track('t', [])]);
    s.scheduler.start();
    s.runUntil(0.3); // scheduled up to 0.4 s: master slot 1.4
    s.edit({ tracks: [master, track('t', [x, y, z])] });
    s.runUntil(1);
    expect(s.events(...OTHER)).toEqual(['z@0.550', 'x@0.800', 'y@1.050']);
  });

  it('starts a refilled master on the slot grid of the tracks still running', () => {
    const other = track('t', [x, y, z]);
    const s = setup([track('m', []), other]);
    s.scheduler.start();
    s.runUntil(0.3); // the other track is at slot 1.4
    s.edit({ tracks: [track('m', [a, b]), other] });
    s.runUntil(1);
    expect(s.events(...MASTER)).toEqual(['a@0.550', 'b@0.800', 'a@1.050']);
  });
});

describe('tracks sharing the loop', () => {
  it('fits the whole track into the master loop, every loop', () => {
    const s = setup([track('m', [a, b, c, d]), track('t', [x, y, z], 'loop')]);
    s.scheduler.start();
    s.runUntil(2);
    expect(s.events(...OTHER)).toEqual([
      'x@0.050',
      'y@0.383',
      'z@0.717',
      'x@1.050',
      'y@1.383',
      'z@1.717',
      'x@2.050',
    ]);
  });

  it('squeezes a longer track too, groups included', () => {
    const s = setup([track('m', [a, b]), track('t', [x, y, z, group('g', [w, square('v', 'v')])], 'loop')]);
    s.scheduler.start();
    s.runUntil(0.5);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.175', 'z@0.300', 'w@0.425', 'x@0.550']);
    expect(s.engine.log.find((e) => e.soundId === 'v')?.when).toBeCloseTo(0.4875, 9);
  });

  it('ignores sync on the master', () => {
    const s = setup([track('m', [a, b], 'loop'), track('t', [x], 'loop')]);
    s.scheduler.start();
    s.runUntil(0.5);
    expect(s.events(...MASTER)).toEqual(['a@0.050', 'b@0.300', 'a@0.550']);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'x@0.550']);
  });

  it('stays on the master loop start after the master shrinks mid-play', () => {
    const other = track('t', [x, y, z], 'loop');
    const s = setup([track('m', [a, b, c, d]), other]);
    s.scheduler.start();
    s.runUntil(0.3); // master at slot 1.4, its loop now ends at 0.55 s
    s.edit({ tracks: [track('m', [a, b]), other] });
    s.runUntil(1);
    expect(s.events('a')).toEqual(['a@0.050', 'a@0.550', 'a@1.050']);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.383', 'x@0.550', 'y@0.717', 'z@0.883', 'x@1.050']);
  });

  it('stays on the master loop start after the track grows mid-play, doubling no note', () => {
    const master = track('m', [a, b, c, d]);
    const s = setup([master, track('t', [x, y, z], 'loop')]);
    s.scheduler.start();
    s.runUntil(0.3);
    s.edit({ tracks: [master, track('t', [x, y, z, w], 'loop')] });
    s.runUntil(1);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.383', 'z@0.550', 'w@0.800', 'x@1.050']);
  });

  it('runs at the slot duration while the master is empty', () => {
    const s = setup([track('m', []), track('t', [x, y], 'loop')]);
    s.scheduler.start();
    s.runUntil(0.5);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.300', 'x@0.550']);
  });

  it('continues on the slot grid when switched to slot sync mid-play', () => {
    const master = track('m', [a, b, c, d]);
    const s = setup([master, track('t', [x, y, z], 'loop')]);
    s.scheduler.start();
    s.runUntil(0.3);
    s.edit({ tracks: [master, track('t', [x, y, z])] });
    s.runUntil(1);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.383', 'z@0.550', 'x@0.800', 'y@1.050']);
  });

  it('snaps to the master loop when switched to loop sync mid-play', () => {
    const master = track('m', [a, b, c, d]);
    const s = setup([master, track('t', [x, y], 'slot')]);
    s.scheduler.start();
    s.runUntil(0.3);
    s.edit({ tracks: [master, track('t', [x, y], 'loop')] });
    s.runUntil(1);
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.300', 'y@0.550', 'x@1.050']);
  });

  it('swings the pairs of its own slots, scaled into the master loop', () => {
    const s = setup([track('m', [a, b, c, d]), track('t', [x, y], 'loop')]);
    s.edit({ swing: 0.5 });
    s.scheduler.start();
    s.runUntil(1);
    // The pair x–y spans the whole loop (1 s): y moves from its half to three quarters.
    expect(s.events(...OTHER)).toEqual(['x@0.050', 'y@0.800', 'x@1.050']);
  });
});

describe('positionAt for a track', () => {
  it('defaults to the master and follows each slot-synced track at its own length', () => {
    const s = setup([track('m', [a, b, c, d]), track('t', [x, y, z])]);
    s.scheduler.start();
    s.runUntil(1);
    expect(s.scheduler.positionAt(0.8)).toBeCloseTo(3, 9);
    expect(s.scheduler.positionAt(0.8, 0)).toBeCloseTo(3, 9);
    expect(s.scheduler.positionAt(0.675, 1)).toBeCloseTo(2.5, 9);
    expect(s.scheduler.positionAt(0.8 + 0.125, 1)).toBeCloseTo(0.5, 9);
  });

  it('maps the master loop onto a loop-synced track', () => {
    const s = setup([track('m', [a, b, c, d]), track('t', [x, y, z], 'loop')]);
    s.scheduler.start();
    s.runUntil(1);
    expect(s.scheduler.positionAt(0.05 + 1 / 3, 1)).toBeCloseTo(1, 9);
    expect(s.scheduler.positionAt(0.55, 1)).toBeCloseTo(1.5, 9);
  });

  it('is null for an empty or missing track and when stopped', () => {
    const s = setup([track('m', [a, b]), track('t', [])]);
    s.scheduler.start();
    s.runUntil(0.3);
    expect(s.scheduler.positionAt(0.3, 1)).toBeNull();
    expect(s.scheduler.positionAt(0.3, 5)).toBeNull();
    s.scheduler.stop();
    expect(s.scheduler.positionAt(0.3, 0)).toBeNull();
  });
});
