import { untrack } from 'svelte';
import { KIT } from './audio/sounds';
import {
  square,
  type IdGen,
  type NodeId,
  type SlotValue,
  type Song,
  type Sound,
  type SoundId,
  type Track,
  type TempoFactor,
} from './core/model';
import type { Area } from './core/dropTarget';
import { clearSound, nodeIds } from './core/ops';
import { SWING_MAX } from './core/timing';

const BPM_MIN = 30;
const BPM_MAX = 300;

/** First-load pattern: a simple 8-slot beat. */
export function defaultSong(nextId: IdGen): Song {
  const beat = ['kick', 'hat', 'snare', 'hat', 'kick', 'kick', 'snare', 'hat'];
  return {
    version: 1,
    bpm: 110,
    slotValue: 8,
    tracks: [{ id: nextId(), nodes: beat.map((sound) => square(nextId(), sound)) }],
  };
}

/** Random-ish ids so nodes created after a reload never collide with saved ones. */
export function randomIdGen(prefix = 'n'): IdGen {
  return () => `${prefix}${crypto.randomUUID().slice(0, 8)}`;
}

/**
 * App-wide reactive state. The song is `$state.raw`: ops are immutable and keep the identity of unchanged
 * parts, which the scheduler relies on to memoize timelines.
 */
export class AppState {
  song: Song = $state.raw() as Song;
  sounds: readonly Sound[] = $state.raw(KIT);
  selection: ReadonlySet<NodeId> = $state.raw(new Set());
  /** True while the transport is running (owned by the transport/audio layer). */
  playing = $state(false);
  /** Leaf currently under the playhead, updated every animation frame while playing; null when stopped. */
  playheadId: NodeId | null = $state(null);
  /**
   * The preparation area: a scratch track that never plays and is never saved (kept out of `song`, so the
   * scheduler and autosave don't see it). Its ids come from the same `nextId`, so they are unique app-wide.
   */
  prep: Track = $state.raw({ id: 'prep', nodes: [] });
  /** Where a palette tap with nothing selected appends: the strip tapped last. */
  activeArea: Area = $state('pattern');
  readonly nextId: IdGen;

  /** `sounds` defaults to the kit; at startup it also holds the restored recordings. */
  constructor({ song, nextId, sounds = KIT }: { song: Song; nextId: IdGen; sounds?: readonly Sound[] }) {
    this.song = song;
    this.nextId = nextId;
    this.sounds = sounds;
  }

  get track(): Track {
    const track = this.song.tracks[0];
    if (!track) throw new Error('song has no track');
    return track;
  }

  /** Applies a pure op to the first track; a no-op (same object back) leaves the song untouched. */
  updateTrack(update: (track: Track) => Track): void {
    this.setTracks({ pattern: update(this.track) });
  }

  trackOf(area: Area): Track {
    return area === 'pattern' ? this.track : this.prep;
  }

  /** Applies a pure op to the pattern or the preparation area. */
  updateArea(area: Area, update: (track: Track) => Track): void {
    this.setTracks({ [area]: update(this.trackOf(area)) });
  }

  /**
   * Replaces the pattern and/or the prep track at once (a drop between them), then drops ids that no longer exist
   * from the selection. Setting both before pruning keeps a node that moved between the areas selected.
   */
  setTracks({ pattern, prep }: { pattern?: Track; prep?: Track }): void {
    let changed = false;
    if (pattern && pattern !== this.track) {
      this.song = { ...this.song, tracks: [pattern, ...this.song.tracks.slice(1)] };
      changed = true;
    }
    if (prep && prep !== this.prep) {
      this.prep = prep;
      changed = true;
    }
    if (!changed) return;
    const alive = new Set([...nodeIds(this.track), ...nodeIds(this.prep)]);
    if ([...this.selection].some((id) => !alive.has(id))) {
      this.selection = new Set([...this.selection].filter((id) => alive.has(id)));
    }
  }

  /** Where Shift+click ranges start: the last node clicked without Shift. Not reactive: nothing renders it. */
  anchor: NodeId | null = null;

  select(ids: Iterable<NodeId>): void {
    this.selection = new Set(ids);
  }

  toggle(id: NodeId): void {
    const next = new Set(this.selection);
    if (!next.delete(id)) next.add(id);
    this.selection = next;
  }

  clearSelection(): void {
    if (this.selection.size > 0) this.selection = new Set();
  }

  setBpm(bpm: number): void {
    if (!Number.isFinite(bpm)) return;
    const clamped = Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, bpm)));
    // Like the ops, an unchanged value keeps the song object (autosave compares references).
    if (clamped !== this.song.bpm) this.song = { ...this.song, bpm: clamped };
  }

  setTempoFactor(tempoFactor: TempoFactor): void {
    if (tempoFactor !== (this.song.tempoFactor ?? 1)) this.song = { ...this.song, tempoFactor };
  }

  /** Swing as a fraction of a slot, clamped to [0, SWING_MAX] and rounded to whole percent (the slider's grid). */
  setSwing(swing: number): void {
    if (Number.isNaN(swing)) return;
    const clamped = Math.round(Math.min(SWING_MAX, Math.max(0, swing)) * 100) / 100;
    if (clamped !== (this.song.swing ?? 0)) this.song = { ...this.song, swing: clamped };
  }

  setSlotValue(slotValue: SlotValue): void {
    if (slotValue !== this.song.slotValue) this.song = { ...this.song, slotValue };
  }

  soundById(id: string): Sound | undefined {
    return this.sounds.find((s) => s.id === id);
  }

  /** Appends a sound (e.g. a recording); an id already present is ignored. */
  addSound(sound: Sound): void {
    if (this.soundById(sound.id)) return;
    this.sounds = [...this.sounds, sound];
  }

  /** Removes a sound; every square that played it, in every track, becomes silent. */
  removeSound(id: SoundId): void {
    if (!this.soundById(id)) return;
    const tracks = this.song.tracks.map((t) => clearSound(t, id));
    if (tracks.some((t, i) => t !== this.song.tracks[i])) this.song = { ...this.song, tracks };
    this.prep = clearSound(this.prep, id);
    this.sounds = this.sounds.filter((s) => s.id !== id);
  }
}

/** Calls `callback` with the current song now and with every new song object after it; returns a stop function. */
export function watchSong(app: AppState, callback: (song: Song) => void): () => void {
  return $effect.root(() => {
    $effect(() => {
      const song = app.song;
      // Only the song is a dependency, whatever the callback happens to read.
      untrack(() => callback(song));
    });
  });
}
