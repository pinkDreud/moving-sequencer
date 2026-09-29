import { describe, expect, it, vi } from 'vitest';
import type { Song } from '../core/model';
import { createAutosave, flushOnHide } from './autosave';

const song = (bpm: number): Song => ({ version: 1, bpm, slotValue: 8, tracks: [{ id: 't', nodes: [] }] });

function fakeTimer() {
  const pending = new Map<number, { callback: () => void; ms: number }>();
  let next = 1;
  return {
    pending,
    setTimeout(callback: () => void, ms: number) {
      pending.set(next, { callback, ms });
      return next++;
    },
    clearTimeout(handle: unknown) {
      pending.delete(handle as number);
    },
    fire() {
      const due = [...pending.values()];
      pending.clear();
      for (const { callback } of due) callback();
    },
  };
}

function setup(saved = song(100)) {
  const timer = fakeTimer();
  const save = vi.fn((_song: Song) => Promise.resolve());
  const autosave = createAutosave({ save, saved, timer });
  return { timer, save, autosave, saved };
}

describe('createAutosave', () => {
  it('does not write the song it started with', () => {
    const { autosave, saved, save, timer } = setup();
    autosave.update(saved);
    expect(timer.pending.size).toBe(0);
    expect(save).not.toHaveBeenCalled();
  });

  it('writes a changed song 500 ms after the change', () => {
    const { autosave, save, timer } = setup();
    const changed = song(120);
    autosave.update(changed);
    expect([...timer.pending.values()].map((p) => p.ms)).toEqual([500]);
    expect(save).not.toHaveBeenCalled();
    timer.fire();
    expect(save).toHaveBeenCalledExactlyOnceWith(changed);
  });

  it('debounces: only the last of quick changes is written, 500 ms after it', () => {
    const { autosave, save, timer } = setup();
    autosave.update(song(120));
    const last = song(130);
    autosave.update(last);
    expect(timer.pending.size).toBe(1);
    timer.fire();
    expect(save).toHaveBeenCalledExactlyOnceWith(last);
  });

  it('compares references: the same object again is not written twice', () => {
    const { autosave, save, timer } = setup();
    const changed = song(120);
    autosave.update(changed);
    timer.fire();
    autosave.update(changed);
    expect(timer.pending.size).toBe(0);
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('writes nothing when the song goes back to the saved one before the delay', () => {
    const { autosave, saved, save, timer } = setup();
    autosave.update(song(120));
    autosave.update(saved);
    timer.fire();
    expect(save).not.toHaveBeenCalled();
  });

  it('flush writes a pending change at once and cancels the timer', async () => {
    const { autosave, save, timer } = setup();
    const changed = song(120);
    autosave.update(changed);
    await autosave.flush();
    expect(save).toHaveBeenCalledExactlyOnceWith(changed);
    expect(timer.pending.size).toBe(0);
    await autosave.flush();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed write', async () => {
    const timer = fakeTimer();
    const save = vi.fn(() => Promise.reject(new Error('QuotaExceededError')));
    const autosave = createAutosave({ save, saved: song(100), timer });
    autosave.update(song(120));
    await expect(autosave.flush()).resolves.toBeUndefined();
    autosave.update(song(130));
    timer.fire();
    await Promise.resolve();
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('flushOnHide', () => {
  function page() {
    const win = new EventTarget();
    const doc = Object.assign(new EventTarget(), { visibilityState: 'visible' as DocumentVisibilityState });
    const autosave = { update: vi.fn(), flush: vi.fn(() => Promise.resolve()) };
    flushOnHide(autosave, win, doc);
    return { win, doc, autosave };
  }

  it('flushes on pagehide', () => {
    const { win, autosave } = page();
    win.dispatchEvent(new Event('pagehide'));
    expect(autosave.flush).toHaveBeenCalledTimes(1);
  });

  it('flushes when the page becomes hidden, not when it becomes visible', () => {
    const { doc, autosave } = page();
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(autosave.flush).not.toHaveBeenCalled();
    doc.visibilityState = 'hidden';
    doc.dispatchEvent(new Event('visibilitychange'));
    expect(autosave.flush).toHaveBeenCalledTimes(1);
  });
});
