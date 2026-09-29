// Test-only helpers for the recording UI. Not imported by app code.
import { vi, type Mock } from 'vitest';
import type { MicAvailability, Recording } from '../audio/recorder';
import type { SoundId } from '../core/model';
import { RecordControl, type RecordControlDeps } from './recordControl.svelte';

/** A `RecordControl` on fakes: a manual clock and interval, and recordings/saves the test settles by hand. */
export function fakeRecordDeps(overrides: Partial<RecordControlDeps> = {}) {
  const sessions: {
    recording: Recording & { stop: Mock };
    finish(blob: Blob): void;
    fail(e: unknown): void;
  }[] = [];
  const saves: (() => void)[] = [];
  let nextHandle = 1;
  const fake = {
    ms: 0,
    intervals: new Map<number, () => void>(),
    tick() {
      for (const callback of fake.intervals.values()) callback();
    },
    session() {
      const session = sessions.at(-1);
      if (!session) throw new Error('not recording');
      return session;
    },
    saved() {
      saves.shift()?.();
    },
  };
  const deps = {
    availability: 'ok' as MicAvailability,
    start: vi.fn((): Promise<Recording> => {
      let finish: (blob: Blob) => void = () => {};
      let fail: (e: unknown) => void = () => {};
      const result = new Promise<Blob>((resolve, reject) => {
        finish = resolve;
        fail = reject;
      });
      const recording = { stop: vi.fn(), result };
      sessions.push({ recording, finish, fail });
      return Promise.resolve(recording);
    }),
    save: vi.fn((_blob: Blob) => new Promise<void>((resolve) => saves.push(resolve))),
    remove: vi.fn((_id: SoundId) => {}),
    clock: () => fake.ms,
    interval: {
      set: (callback: () => void) => {
        const handle = nextHandle++;
        fake.intervals.set(handle, callback);
        return handle;
      },
      clear: (handle: unknown) => {
        fake.intervals.delete(handle as number);
      },
    },
    ...overrides,
  };
  return { control: new RecordControl(deps), deps, fake };
}
