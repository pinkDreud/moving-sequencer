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
} from './core/model';
import { clearSound, nodeIds } from './core/ops';

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
    const track = update(this.track);
    if (track === this.track) return;
    this.song = { ...this.song, tracks: [track, ...this.song.tracks.slice(1)] };
    const alive = new Set(nodeIds(track));
    if ([...this.selection].some((id) => !alive.has(id))) {
      this.selection = new Set([...this.selection].filter((id) => alive.has(id)));
    }
  }

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
