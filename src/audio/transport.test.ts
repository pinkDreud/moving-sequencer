import { describe, expect, it } from 'vitest';
import { createIdGen, group, square, type SeqNode } from '../core/model';
import { AppState } from '../state.svelte';
import { FakeEngine } from './engine';
import type { Timer } from './scheduler';
import { createTransport, type FrameLoop } from './transport';

class FakeTimer implements Timer {
  callback: (() => void) | undefined;
  installs = 0;
  setInterval(callback: () => void) {
    this.callback = callback;
    this.installs++;
    return 'timer';
  }
  clearInterval() {
    this.callback = undefined;
  }
}

/** Manual `requestAnimationFrame`: `run()` fires the pending frame callbacks once. */
class FakeFrames implements FrameLoop {
  pending = new Map<number, () => void>();
  private next = 1;
  request(callback: () => void) {
    this.pending.set(this.next, callback);
    return this.next++;
  }
  cancel(handle: unknown) {
    if (typeof handle === 'number') this.pending.delete(handle);
  }
  run() {
    const callbacks = [...this.pending.values()];
    this.pending.clear();
    for (const callback of callbacks) callback();
  }
}

function deferred() {
  let resolve = () => {};
  let reject = (_error: unknown) => {};
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const beat = ['kick', 'hat', 'snare', 'hat'].map((sound, i) => square(`s${i}`, sound));

/** 120 bpm, eighth-note slots → 0.25 s per slot; the scheduler's first event lands at 0.05 s. */
function setup(nodes: SeqNode[] = beat, unlock?: () => Promise<void>) {
  const app = new AppState({
    song: { version: 1, bpm: 120, slotValue: 8, tracks: [{ id: 't', nodes }] },
    nextId: createIdGen('n'),
  });
  const engine = new FakeEngine();
  const timer = new FakeTimer();
  const frames = new FakeFrames();
  const transport = createTransport({ engine, state: app, timer, frames, unlock });
  return {
    app,
    engine,
    timer,
    frames,
    transport,
    /** Moves the clock, lets the scheduler tick, then renders one animation frame. */
    at(time: number) {
      engine.time = time;
      timer.callback?.();
      frames.run();
    },
    /** Ticks the scheduler every 25 ms up to `time`. */
    runUntil(time: number) {
      for (let t = engine.time + 0.025; t < time + 1e-9; t += 0.025) {
        engine.time = t;
        timer.callback?.();
      }
    },
    events: () => engine.log.map(({ soundId, when }) => `${soundId}@${when.toFixed(3)}`),
  };
}

describe('play', () => {
  it('starts the scheduler, sets playing and puts the playhead on the first square', async () => {
    const s = setup();
    await s.transport.play();
    expect(s.app.playing).toBe(true);
    expect(s.events()).toEqual(['kick@0.050']);
    expect(s.timer.installs).toBe(1);
    expect(s.app.playheadId).toBe('s0');
    expect(s.frames.pending.size).toBe(1);
  });

  it('does nothing when already playing', async () => {
    const s = setup();
    await s.transport.play();
    await s.transport.play();
    expect(s.events()).toEqual(['kick@0.050']);
    expect(s.timer.installs).toBe(1);
    expect(s.frames.pending.size).toBe(1);
  });

  it('awaits unlock before starting the scheduler, so the first event follows the resumed clock', async () => {
    const unlocking = deferred();
    const s = setup(beat, () => unlocking.promise);
    const playing = s.transport.play();
    expect(s.app.playing).toBe(true);
    expect(s.engine.log).toEqual([]);
    s.engine.time = 3;
    unlocking.resolve();
    await playing;
    expect(s.events()).toEqual(['kick@3.050']);
    expect(s.app.playheadId).toBe('s0');
  });

  it('starts nothing when stopped while the context is still unlocking', async () => {
    const unlocking = deferred();
    const s = setup(beat, () => unlocking.promise);
    const playing = s.transport.play();
    s.transport.stop();
    unlocking.resolve();
    await playing;
    expect(s.app.playing).toBe(false);
    expect(s.app.playheadId).toBeNull();
    expect(s.engine.log).toEqual([]);
    expect(s.timer.installs).toBe(0);
    expect(s.frames.pending.size).toBe(0);
  });

  it('only starts once when Play, Stop, Play happen while unlocking', async () => {
    const first = deferred();
    const second = deferred();
    const unlocks = [first, second];
    const s = setup(beat, () => unlocks.shift()?.promise ?? Promise.resolve());
    const p1 = s.transport.play();
    s.transport.stop();
    const p2 = s.transport.play();
    first.resolve();
    await p1;
    expect(s.timer.installs).toBe(0);
    second.resolve();
    await p2;
    expect(s.timer.installs).toBe(1);
    expect(s.app.playing).toBe(true);
  });

  it('still starts when unlock fails (a later gesture may unlock the context)', async () => {
    const s = setup(beat, () => Promise.reject(new Error('not allowed')));
    await s.transport.play();
    expect(s.app.playing).toBe(true);
    expect(s.events()).toEqual(['kick@0.050']);
  });
});

describe('playhead', () => {
  it('follows the leaf heard at engine.now() on every animation frame, wrapping at the loop end', async () => {
    const s = setup();
    await s.transport.play();
    s.at(0.05 + 2.5 * 0.25);
    expect(s.app.playheadId).toBe('s2');
    s.at(0.05 + 3.9 * 0.25);
    expect(s.app.playheadId).toBe('s3');
    s.at(0.05 + 4.1 * 0.25);
    expect(s.app.playheadId).toBe('s0');
    expect(s.frames.pending.size).toBe(1);
  });

  it('points at the leaf inside a group', async () => {
    const s = setup([square('a', 'kick'), group('g', [square('b', 'hat'), square('c', 'snare')])]);
    await s.transport.play();
    s.at(0.05 + 1.25 * 0.25);
    expect(s.app.playheadId).toBe('b');
    s.at(0.05 + 1.75 * 0.25);
    expect(s.app.playheadId).toBe('c');
  });

  it('follows live edits of the pattern', async () => {
    const s = setup();
    await s.transport.play();
    s.at(0.05 + 1.5 * 0.25);
    expect(s.app.playheadId).toBe('s1');
    s.app.updateTrack((track) => ({
      ...track,
      nodes: track.nodes.map((node) => (node.id === 's2' ? square('x', 'clap') : node)),
    }));
    s.at(0.05 + 2.5 * 0.25);
    expect(s.app.playheadId).toBe('x');
  });

  it('is null while playing an empty pattern', async () => {
    const s = setup([]);
    await s.transport.play();
    s.at(0.5);
    expect(s.app.playing).toBe(true);
    expect(s.app.playheadId).toBeNull();
  });
});

describe('stop', () => {
  it('stops the scheduler and the frame loop and clears playing and the playhead', async () => {
    const s = setup();
    await s.transport.play();
    s.at(0.4);
    s.transport.stop();
    expect(s.app.playing).toBe(false);
    expect(s.app.playheadId).toBeNull();
    expect(s.engine.stopAllCount).toBe(1);
    expect(s.timer.callback).toBeUndefined();
    expect(s.frames.pending.size).toBe(0);
  });

  it('play after stop restarts from the first square', async () => {
    const s = setup();
    await s.transport.play();
    s.runUntil(0.6);
    s.transport.stop();
    s.engine.log = [];
    await s.transport.play();
    expect(s.events()).toEqual([`kick@${(0.6 + 0.05).toFixed(3)}`]);
    expect(s.app.playheadId).toBe('s0');
  });
});

describe('toggle', () => {
  it('alternates between play and stop', async () => {
    const s = setup();
    await s.transport.toggle();
    expect(s.app.playing).toBe(true);
    await s.transport.toggle();
    expect(s.app.playing).toBe(false);
    expect(s.engine.stopAllCount).toBe(1);
    await s.transport.toggle();
    expect(s.app.playing).toBe(true);
  });
});

describe('live tempo', () => {
  it('a BPM change while playing applies from the next scheduled event', async () => {
    const s = setup();
    await s.transport.play();
    // Scheduled up to 0.1 s = slot 0.2. At 60 bpm a slot lasts 0.5 s: slot 1 lands at 0.1 + 0.8 × 0.5.
    s.app.setBpm(60);
    s.runUntil(0.6);
    expect(s.events()).toEqual(['kick@0.050', 'hat@0.500']);
  });

  it('a slot value change while playing applies from the next scheduled event', async () => {
    const s = setup();
    await s.transport.play();
    // Sixteenths at 120 bpm: 0.125 s per slot, slot 1 lands at 0.1 + 0.8 × 0.125.
    s.app.setSlotValue(16);
    s.runUntil(0.2);
    expect(s.events()).toEqual(['kick@0.050', 'hat@0.200']);
  });
});
