import type { SoundId } from '../core/model';

/** What the scheduler needs from an audio backend. Times are in the engine's clock (AudioContext seconds). */
export interface AudioEngine {
  now(): number;
  play(soundId: SoundId, when: number): void;
  /** Cancels every sound already scheduled or playing. */
  stopAll(): void;
}

/** Test double (unit tests, `?fake-audio` e2e): manual clock, records what would have played. */
export class FakeEngine implements AudioEngine {
  time = 0;
  log: { soundId: SoundId; when: number }[] = [];
  stopAllCount = 0;

  now(): number {
    return this.time;
  }

  advance(seconds: number): void {
    this.time += seconds;
  }

  play(soundId: SoundId, when: number): void {
    this.log.push({ soundId, when });
  }

  stopAll(): void {
    this.stopAllCount++;
  }
}
