import type { Song } from '../core/model';

export interface AutosaveOptions {
  save(song: Song): Promise<void>;
  /** The song already stored (or shown at startup): not written again until it changes. */
  saved: Song;
  delayMs?: number;
  timer?: { setTimeout(callback: () => void, ms: number): unknown; clearTimeout(handle: unknown): void };
}

export interface Autosave {
  /** Reports the current song; a new song object is written `delayMs` after the last change. */
  update(song: Song): void;
  /** Writes a pending change now (the page is being hidden or closed). */
  flush(): Promise<void>;
}

const browserTimer = {
  setTimeout: (callback: () => void, ms: number): unknown => setTimeout(callback, ms),
  clearTimeout: (handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>),
};

/**
 * Debounced saving of the song. Ops and setters keep the song object when nothing changes, so a reference
 * comparison is enough to skip needless writes.
 */
export function createAutosave({
  save,
  saved,
  delayMs = 500,
  timer = browserTimer,
}: AutosaveOptions): Autosave {
  let lastSaved = saved;
  let pending: Song | undefined;
  let handle: unknown;

  async function write(): Promise<void> {
    timer.clearTimeout(handle);
    handle = undefined;
    const song = pending;
    pending = undefined;
    if (!song || song === lastSaved) return;
    const previous = lastSaved;
    lastSaved = song;
    try {
      await save(song);
    } catch {
      // Storage full or its connection lost (iOS, after backgrounding): the user sees nothing, and the song stays
      // pending so the next change or flush (e.g. on pagehide) tries again. A newer pending song supersedes it.
      if (lastSaved === song) lastSaved = previous;
      pending ??= song;
    }
  }

  return {
    update(song) {
      if (song === (pending ?? lastSaved)) return;
      pending = song;
      timer.clearTimeout(handle);
      handle = timer.setTimeout(() => void write(), delayMs);
    },
    flush: write,
  };
}

/** Flushes the autosave when the page is hidden or unloaded: mobile browsers may kill a hidden tab at any time. */
export function flushOnHide(
  autosave: Pick<Autosave, 'flush'>,
  win: EventTarget = window,
  doc: EventTarget & { visibilityState: DocumentVisibilityState } = document,
): void {
  win.addEventListener('pagehide', () => void autosave.flush());
  doc.addEventListener('visibilitychange', () => {
    if (doc.visibilityState === 'hidden') void autosave.flush();
  });
}
