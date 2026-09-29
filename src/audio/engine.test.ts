import { describe, expect, it } from 'vitest';
import { FakeEngine } from './engine';

describe('FakeEngine', () => {
  it('has a manual clock that can be set and advanced', () => {
    const engine = new FakeEngine();
    expect(engine.now()).toBe(0);
    engine.advance(0.5);
    expect(engine.now()).toBe(0.5);
    engine.time = 3;
    expect(engine.now()).toBe(3);
  });

  it('logs played sounds and counts stopAll calls', () => {
    const engine = new FakeEngine();
    engine.play('kick', 1);
    engine.play('hat', 1.25);
    engine.stopAll();
    expect(engine.log).toEqual([
      { soundId: 'kick', when: 1 },
      { soundId: 'hat', when: 1.25 },
    ]);
    expect(engine.stopAllCount).toBe(1);
  });
});
