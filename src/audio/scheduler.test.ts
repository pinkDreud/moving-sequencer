import { beforeEach, describe, expect, it, vi } from 'vitest';
import { group, square, type SeqNode, type Song } from '../core/model';
import { buildTimeline } from '../core/timeline';
import { secondsPerSlot } from '../core/timing';
import { FakeEngine } from './engine';
import { createScheduler, type SchedulerOptions, type Timer } from './scheduler';

vi.mock('../core/timeline', { spy: true });
// A returned function would be run as teardown, hence the braces.
beforeEach(() => {
  vi.mocked(buildTimeline).mockClear();
});

const [a, b, c, d] = [square('a', 'a'), square('b', 'b'), square('c', 'c'), square('d', 'd')] as const;

class FakeTimer implements Timer {
  callback: (() => void) | undefined;
  ms = 0;
  installs = 0;
  cleared: unknown[] = [];
  setInterval(callback: () => void, ms: number) {
    this.callback = callback;
    this.ms = ms;
    this.installs++;
    return 'handle';
  }
  clearInterval(handle: unknown) {
    this.cleared.push(handle);
  }
}

/** Default song: 120 bpm, eighth-note slots → 0.25 s per slot; default startOffset 0.05 s, lookahead 0.1 s. */
function setup(nodes: SeqNode[], options: Partial<SchedulerOptions> = {}) {
  const engine = new FakeEngine();
  const timer = new FakeTimer();
  let song: Song = { version: 1, bpm: 120, slotValue: 8, tracks: [{ id: 't', nodes }] };
  const getSong = vi.fn(() => song);
  const scheduler = createScheduler({ engine, getSong, timer, ...options });
  const tickAt = (time: number) => {
    engine.time = time;
    scheduler.tick();
  };
  return {
    engine,
    timer,
    scheduler,
    getSong,
    tickAt,
    /** Ticks every `step` seconds, the last tick landing exactly on `time`. */
    runUntil(time: number, step = 0.025) {
      for (let t = engine.time + step; t < time - 1e-12; t += step) tickAt(t);
      tickAt(time);
    },
    edit(patch: Partial<Song>) {
      song = { ...song, ...patch };
    },
    setNodes(next: SeqNode[]) {
      song = { ...song, tracks: [{ id: 't', nodes: next }] };
    },
    events: () => engine.log.map(({ soundId, when }) => `${soundId}@${when.toFixed(3)}`),
  };
}

describe('start', () => {
  it('schedules the first leaf after the start offset and installs the tick timer', () => {
    const s = setup([a, b]);
    s.engine.time = 10;
    s.scheduler.start();
    expect(s.scheduler.isPlaying).toBe(true);
    expect(s.events()).toEqual(['a@10.050']);
    expect(s.timer.ms).toBe(25);
    s.engine.time = 10.3;
    s.timer.callback?.();
    expect(s.events()).toEqual(['a@10.050', 'b@10.300']);
  });

  it('does nothing when already playing', () => {
    const s = setup([a, b]);
    s.scheduler.start();
    s.scheduler.start();
    expect(s.timer.installs).toBe(1);
    expect(s.events()).toEqual(['a@0.050']);
  });
});

describe('tick', () => {
  it('schedules events on the slot grid, only within the lookahead', () => {
    const s = setup([a, b, c, d]);
    s.scheduler.start();
    s.runUntil(0.2);
    expect(s.events()).toEqual(['a@0.050']);
    s.runUntil(0.25);
    expect(s.events()).toEqual(['a@0.050', 'b@0.300']);
  });

  it('never plays silent or muted squares', () => {
    const s = setup([a, square('s', null), square('m', 'm', true), b]);
    s.scheduler.start();
    s.runUntil(1.9);
    expect(s.events()).toEqual(['a@0.050', 'b@0.800', 'a@1.050', 'b@1.800']);
  });

  it('wraps at the loop end across several loops', () => {
    const s = setup([a, b]);
    s.scheduler.start();
    s.runUntil(1.9);
    expect(s.events()).toEqual([
      'a@0.050',
      'b@0.300',
      'a@0.550',
      'b@0.800',
      'a@1.050',
      'b@1.300',
      'a@1.550',
      'b@1.800',
    ]);
  });

  it('wraps several times within one tick when the lookahead spans several loops', () => {
    const s = setup([a, b], { lookahead: 2 });
    s.scheduler.start();
    expect(s.events()).toEqual([
      'a@0.050',
      'b@0.300',
      'a@0.550',
      'b@0.800',
      'a@1.050',
      'b@1.300',
      'a@1.550',
      'b@1.800',
    ]);
  });

  it('reads the song on every tick and builds the timeline once per track object', () => {
    const s = setup([a, b]);
    s.scheduler.start();
    s.runUntil(0.5);
    expect(s.getSong.mock.calls.length).toBeGreaterThanOrEqual(21);
    expect(buildTimeline).toHaveBeenCalledTimes(1);
    s.edit({ bpm: 90 }); // new song object, same track object
    s.runUntil(0.6);
    expect(buildTimeline).toHaveBeenCalledTimes(1);
    s.setNodes([a, b]);
    s.runUntil(0.7);
    expect(buildTimeline).toHaveBeenCalledTimes(2);
  });
});

describe('exactly once', () => {
  const nodes = [a, group('g', [b, c, d]), group('h', [a, group('i', [b, square('x', null), c])])];

  /** Ground truth: every audible leaf of every loop, at startOffset + absolute slot position × seconds per slot. */
  function expected(bpm: number, until: number) {
    const tl = buildTimeline({ id: 't', nodes });
    const sps = secondsPerSlot(bpm, 16);
    const out: { soundId: string; when: number }[] = [];
    for (let loop = 0; 0.05 + loop * tl.length * sps < until; loop++)
      for (const leaf of tl.leaves)
        if (leaf.audible && leaf.soundId !== null)
          out.push({ soundId: leaf.soundId, when: 0.05 + (loop * tl.length + leaf.start) * sps });
    return out.filter((e) => e.when < until);
  }

  it.each([0.025, 0.0137, 0.1, 0.1 / 3, 0.07, 0.0999])(
    'produces the same events whatever the tick step (step %s s)',
    (step) => {
      const s = setup(nodes);
      s.edit({ bpm: 100, slotValue: 16 });
      s.scheduler.start();
      s.runUntil(5, step);
      const heard = s.engine.log.filter((e) => e.when < 5);
      const truth = expected(100, 5);
      expect(heard.map((e) => e.soundId)).toEqual(truth.map((e) => e.soundId));
      heard.forEach((e, i) => expect(Math.abs(e.when - (truth[i]?.when ?? NaN))).toBeLessThan(1e-9));
    },
  );

  it.each([-1e-12, -1e-15, -2.2e-16, 0, 2.2e-16, 1e-15, 1e-12])(
    'schedules a third-boundary leaf once when the window ends %s s from it',
    (delta) => {
      // 60 bpm quarter slots: 1 s per slot, so C of [A, (B C D)] starts at 4/3 s.
      const s = setup([a, group('g', [b, c, d])], { startOffset: 0 });
      s.edit({ bpm: 60, slotValue: 4 });
      s.scheduler.start();
      s.runUntil(1 + 1 / 3 - 0.1 + delta);
      s.runUntil(1.95);
      expect(s.events()).toEqual(['a@0.000', 'b@1.000', 'c@1.333', 'd@1.667', 'a@2.000']);
    },
  );
});

describe('live edits', () => {
  it('continues at cursor mod new length when the pattern shrinks under the cursor', () => {
    const s = setup([a, b, c, d]);
    s.scheduler.start();
    s.runUntil(0.55); // cursor at slot 2.4, C just scheduled
    expect(s.events().at(-1)).toBe('c@0.550');
    s.setNodes([a, b]);
    s.runUntil(1.5);
    expect(s.events().slice(3)).toEqual(['b@0.800', 'a@1.050', 'b@1.300', 'a@1.550']);
  });

  it('plays appended squares in the current loop when the cursor has not passed them', () => {
    const s = setup([a, b]);
    s.scheduler.start();
    s.runUntil(0.3); // cursor at slot 1.4
    s.setNodes([a, b, c]);
    s.runUntil(1.2);
    expect(s.events()).toEqual(['a@0.050', 'b@0.300', 'c@0.550', 'a@0.800', 'b@1.050']);
  });

  it('schedules nothing for an empty pattern and starts at the last horizon once squares are added', () => {
    const s = setup([]);
    s.scheduler.start();
    s.runUntil(0.5);
    expect(s.events()).toEqual([]);
    s.setNodes([a]);
    s.tickAt(0.525);
    s.runUntil(1);
    expect(s.events()).toEqual(['a@0.600', 'a@0.850']);
  });

  it('applies a tempo change from the cursor without moving scheduled events', () => {
    const s = setup([a, b, c, d]);
    s.scheduler.start();
    s.runUntil(0.25); // cursor at slot 1.2, B scheduled at 0.3
    s.edit({ bpm: 60 }); // 0.5 s per slot
    s.runUntil(1.5);
    expect(s.events()).toEqual(['a@0.050', 'b@0.300', 'c@0.750', 'd@1.250']);
  });

  it('follows position in time: swapping the next two squares plays them swapped', () => {
    const s = setup([a, b, c, d]);
    s.scheduler.start();
    s.runUntil(0.25);
    expect(s.events()).toEqual(['a@0.050', 'b@0.300']);
    s.setNodes([a, b, d, c]);
    s.runUntil(0.8);
    expect(s.events()).toEqual(['a@0.050', 'b@0.300', 'd@0.550', 'c@0.800']);
  });

  it('silences the next square when muted and plays it again when unmuted before it is scheduled', () => {
    const s = setup([a, b, c, d]);
    s.scheduler.start();
    s.runUntil(0.25);
    s.setNodes([a, b, square('c', 'c', true), d]);
    s.runUntil(0.8);
    expect(s.events().slice(2)).toEqual(['d@0.800']);
    s.runUntil(1.25); // next loop: B scheduled, C not yet
    s.setNodes([a, b, c, d]);
    s.runUntil(1.55);
    expect(s.events().slice(3)).toEqual(['a@1.050', 'b@1.300', 'c@1.550']);
  });
});

describe('stop', () => {
  it('stops the engine and the timer, and a later start restarts from slot 0', () => {
    const s = setup([a, b, c, d]);
    s.scheduler.start();
    s.runUntil(0.5);
    s.scheduler.stop();
    expect(s.scheduler.isPlaying).toBe(false);
    expect(s.engine.stopAllCount).toBe(1);
    expect(s.timer.cleared).toEqual(['handle']);
    const before = s.events();
    s.tickAt(0.6);
    expect(s.events()).toEqual(before);

    s.engine.time = 3;
    s.scheduler.start();
    s.runUntil(3.3);
    expect(s.events().slice(before.length)).toEqual(['a@3.050', 'b@3.300']);
  });

  it('does nothing when already stopped', () => {
    const s = setup([a]);
    s.scheduler.stop();
    expect(s.engine.stopAllCount).toBe(0);
    expect(s.timer.cleared).toEqual([]);
  });
});

describe('robustness', () => {
  it('drops events that are already late instead of playing them in a burst', () => {
    const s = setup([a, b, c, d]);
    s.scheduler.start();
    s.runUntil(0.2); // scheduled up to 0.3 s
    s.tickAt(1); // a throttled tab wakes up 0.7 s late: position is now slot 3.8
    expect(s.events()).toEqual(['a@0.050', 'a@1.050']);
    expect(s.scheduler.positionAt(1)).toBeCloseTo(3.8, 9);
  });

  it('schedules nothing and does not throw for an invalid tempo', () => {
    const s = setup([a, b]);
    s.edit({ bpm: 0 });
    s.scheduler.start();
    s.runUntil(1);
    expect(s.events()).toEqual([]);
    expect(s.scheduler.positionAt(1)).toBeNull();
  });

  it('bounds the work done by one tick even for absurdly short loops', () => {
    const s = setup([a]);
    s.edit({ bpm: 1e12 });
    s.scheduler.start();
    expect(s.engine.log.length).toBeGreaterThan(0);
    expect(s.engine.log.length).toBeLessThanOrEqual(10_000);
  });
});

describe('positionAt', () => {
  it('returns the slot position heard at a given time, wrapping at the loop end', () => {
    const s = setup([a, b]);
    s.scheduler.start();
    s.runUntil(0.6);
    expect(s.scheduler.positionAt(0.05)).toBeCloseTo(0, 9);
    expect(s.scheduler.positionAt(0.3)).toBeCloseTo(1, 9);
    expect(s.scheduler.positionAt(0.6)).toBeCloseTo(0.2, 9);
  });

  it('is 0 before the first event and null when stopped', () => {
    const s = setup([a, b]);
    expect(s.scheduler.positionAt(0)).toBeNull();
    s.scheduler.start();
    expect(s.scheduler.positionAt(0.01)).toBe(0);
    s.scheduler.stop();
    expect(s.scheduler.positionAt(0.1)).toBeNull();
  });

  it('stays within the current pattern after it shrinks, before the next tick', () => {
    const s = setup([a, b, c, d]);
    s.scheduler.start();
    s.runUntil(0.55);
    s.setNodes([a, b]);
    expect(s.scheduler.positionAt(0.6)).toBeCloseTo(0.2, 9);
  });
});
