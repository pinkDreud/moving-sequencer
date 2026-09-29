import { describe, expect, it } from 'vitest';
import { FakeEngine, RealtimeFakeEngine, unlockOnGesture, WebAudioEngine } from './engine';

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

  it('keeps loaded buffers by sound id and forgets unloaded ones', () => {
    const engine = new FakeEngine();
    const buffer = { duration: 1 } as unknown as AudioBuffer;
    engine.load('rec-a', buffer);
    expect(engine.loaded.get('rec-a')).toBe(buffer);
    engine.unload('rec-a');
    expect(engine.loaded.has('rec-a')).toBe(false);
  });
});

describe('RealtimeFakeEngine', () => {
  it('follows an injected millisecond clock, starting at 0, and still logs plays', () => {
    let ms = 1000;
    const engine = new RealtimeFakeEngine(() => ms);
    expect(engine.now()).toBe(0);
    ms = 1250;
    expect(engine.now()).toBe(0.25);
    engine.play('kick', 0.3);
    expect(engine.log).toEqual([{ soundId: 'kick', when: 0.3 }]);
  });
});

class FakeParam {
  value = 1;
}

class FakeNode {
  connections: unknown[] = [];
  disconnected = false;
  connect(target: unknown) {
    this.connections.push(target);
    return target;
  }
  disconnect() {
    this.disconnected = true;
  }
}

class FakeSource extends FakeNode {
  buffer: unknown = null;
  onended: (() => void) | null = null;
  startedAt: number[] = [];
  stops = 0;
  start(when = 0) {
    this.startedAt.push(when);
  }
  stop() {
    this.stops++;
  }
  /** What the browser does when the sound finishes or is stopped. */
  end() {
    this.onended?.();
  }
}

class FakeContext {
  currentTime = 0;
  state: AudioContextState = 'suspended';
  destination = new FakeNode();
  gains: (FakeNode & { gain: FakeParam })[] = [];
  sources: FakeSource[] = [];
  resumes = 0;
  createGain() {
    const gain = Object.assign(new FakeNode(), { gain: new FakeParam() });
    this.gains.push(gain);
    return gain;
  }
  createBufferSource() {
    const source = new FakeSource();
    this.sources.push(source);
    return source;
  }
  resume() {
    this.resumes++;
    this.state = 'running';
    return Promise.resolve();
  }
}

function webEngine() {
  const context = new FakeContext();
  // The fake implements the part of AudioContext that WebAudioEngine uses.
  const engine = new WebAudioEngine(context as unknown as AudioContext);
  const kick = { duration: 0.5 } as unknown as AudioBuffer;
  engine.load('kick', kick);
  return { context, engine, kick };
}

describe('WebAudioEngine', () => {
  it('routes everything through a master gain below unity into the destination', () => {
    const { context } = webEngine();
    expect(context.gains).toHaveLength(1);
    const master = context.gains[0];
    expect(master?.gain.value).toBe(0.8);
    expect(master?.connections).toEqual([context.destination]);
  });

  it('reads its clock from the context', () => {
    const { context, engine } = webEngine();
    context.currentTime = 12.5;
    expect(engine.now()).toBe(12.5);
  });

  it('plays a loaded sound with a new buffer source started at the given time', () => {
    const { context, engine, kick } = webEngine();
    engine.play('kick', 1.25);
    engine.play('kick', 1.5);
    expect(context.sources).toHaveLength(2);
    const [first, second] = context.sources;
    expect(first?.buffer).toBe(kick);
    expect(first?.connections).toEqual([context.gains[0]]);
    expect(first?.startedAt).toEqual([1.25]);
    expect(second?.startedAt).toEqual([1.5]);
  });

  it('does not play an unloaded sound', () => {
    const { context, engine } = webEngine();
    engine.unload('kick');
    engine.play('kick', 1);
    expect(context.sources).toHaveLength(0);
  });

  it('ignores unknown sound ids', () => {
    const { context, engine } = webEngine();
    engine.play('cowbell', 1);
    expect(context.sources).toHaveLength(0);
  });

  it('stopAll stops every scheduled or playing source', () => {
    const { context, engine } = webEngine();
    engine.play('kick', 1);
    engine.play('kick', 2);
    engine.stopAll();
    expect(context.sources.map((s) => s.stops)).toEqual([1, 1]);
  });

  it('forgets sources once they end, so stopAll does not touch them again', () => {
    const { context, engine } = webEngine();
    engine.play('kick', 1);
    engine.play('kick', 2);
    context.sources[0]?.end();
    expect(context.sources[0]?.disconnected).toBe(true);
    engine.stopAll();
    expect(context.sources.map((s) => s.stops)).toEqual([0, 1]);
    engine.stopAll();
    expect(context.sources.map((s) => s.stops)).toEqual([0, 1]);
  });

  it('unlock resumes a suspended context and leaves a running one alone', async () => {
    const { context, engine } = webEngine();
    await engine.unlock();
    expect(context.resumes).toBe(1);
    expect(context.state).toBe('running');
    await engine.unlock();
    expect(context.resumes).toBe(1);
  });
});

describe('unlockOnGesture', () => {
  /** Lets the resume promise and its handlers settle. */
  const settle = () => new Promise((resolve) => setTimeout(resolve));

  it('retries on every pointerdown/pointerup/keydown until the context runs, then stops listening', async () => {
    const { context, engine } = webEngine();
    let accepted = false;
    // A browser refuses resume() outside what it counts as a gesture (iOS: pointerdown from touch).
    context.resume = () => {
      context.resumes++;
      if (!accepted) return Promise.reject(new Error('NotAllowedError'));
      context.state = 'running';
      return Promise.resolve();
    };
    const target = new EventTarget();
    unlockOnGesture(engine, target);

    target.dispatchEvent(new Event('pointerdown'));
    await settle();
    expect(context.resumes).toBe(1);
    expect(context.state).toBe('suspended');

    accepted = true;
    target.dispatchEvent(new Event('pointerup'));
    await settle();
    expect(context.resumes).toBe(2);
    expect(context.state).toBe('running');

    context.state = 'suspended';
    target.dispatchEvent(new Event('keydown'));
    await settle();
    expect(context.resumes).toBe(2);
  });

  it('keeps listening when resume() settles but the context is still not running', async () => {
    const { context, engine } = webEngine();
    context.resume = () => {
      context.resumes++;
      return Promise.resolve();
    };
    const target = new EventTarget();
    unlockOnGesture(engine, target);
    target.dispatchEvent(new Event('pointerdown'));
    await settle();
    target.dispatchEvent(new Event('keydown'));
    await settle();
    expect(context.resumes).toBe(2);
  });
});
