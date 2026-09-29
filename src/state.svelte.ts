import { KIT } from './audio/sounds';
import {
  square,
  type IdGen,
  type NodeId,
  type SlotValue,
  type Song,
  type Sound,
  type Track,
} from './core/model';
import { nodeIds } from './core/ops';

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

  constructor({ song, nextId }: { song: Song; nextId: IdGen }) {
    this.song = song;
    this.nextId = nextId;
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
    this.song = { ...this.song, bpm: Math.round(Math.min(BPM_MAX, Math.max(BPM_MIN, bpm))) };
  }

  setSlotValue(slotValue: SlotValue): void {
    this.song = { ...this.song, slotValue };
  }

  soundById(id: string): Sound | undefined {
    return this.sounds.find((s) => s.id === id);
  }
}
