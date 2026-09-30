import { describe, expect, it } from 'vitest';
import { createIdGen, square } from '../core/model';
import { AppState } from '../state.svelte';
import { FakeEngine } from './engine';
import { createTransport } from './transport';

/** Master of 4 slots and a second track of 3; 0.25 s per slot, first event at 0.05 s. */
function setup(sync: 'slot' | 'loop') {
  const app = new AppState({
    song: {
      version: 1,
      bpm: 120,
      slotValue: 8,
      tracks: [
        { id: 'm', nodes: ['kick', 'hat', 'snare', 'hat'].map((s, i) => square(`m${i}`, s)) },
        { id: 't', nodes: ['clap', 'rim', 'clap'].map((s, i) => square(`t${i}`, s)), sync },
      ],
    },
    nextId: createIdGen('n'),
  });
  const engine = new FakeEngine();
  let tick: (() => void) | undefined;
  let frame: (() => void) | undefined;
  const transport = createTransport({
    engine,
    state: app,
    timer: { setInterval: (callback) => (tick = callback), clearInterval: () => (tick = undefined) },
    frames: { request: (callback) => (frame = callback), cancel: () => (frame = undefined) },
  });
  return {
    app,
    engine,
    transport,
    /** Moves the clock, lets the scheduler tick, then renders one animation frame. */
    at(time: number) {
      engine.time = time;
      tick?.();
      frame?.();
    },
  };
}

describe('transport with several tracks', () => {
  it('schedules all the tracks together', async () => {
    const s = setup('slot');
    await s.transport.play();
    expect(s.engine.log.map((e) => e.soundId).sort()).toEqual(['clap', 'kick']);
  });

  it('shows the playhead of the active track', async () => {
    const s = setup('slot');
    await s.transport.play();
    s.at(0.05 + 3.5 * 0.25);
    expect(s.app.playheadId).toBe('m3');
    s.app.selectTrack(1);
    // Slot 3.5 of the master is slot 0.5 of the 3-slot track.
    s.at(0.05 + 3.5 * 0.25);
    expect(s.app.playheadId).toBe('t0');
  });

  it('follows a loop-synced track across the master loop', async () => {
    const s = setup('loop');
    s.app.selectTrack(1);
    await s.transport.play();
    s.at(0.05 + 1.2 * 0.25);
    expect(s.app.playheadId).toBe('t0');
    s.at(0.05 + 1.5 * 0.25);
    expect(s.app.playheadId).toBe('t1');
    s.at(0.05 + 3 * 0.25);
    expect(s.app.playheadId).toBe('t2');
  });
});
