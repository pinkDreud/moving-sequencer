export type NodeId = string;
export type SoundId = string;

/** One subdivision. `soundId: null` = silent square; `muted` silences it but keeps the sound. */
export interface Square {
  kind: 'square';
  id: NodeId;
  soundId: SoundId | null;
  muted: boolean;
}

/** Nested subdivision: occupies `span` slots, children split that time evenly. */
export interface Group {
  kind: 'group';
  id: NodeId;
  span: 1;
  children: SeqNode[];
}

export type SeqNode = Square | Group;

/**
 * What a track shares with the master (the first track): `slot` = the duration of one slot, so it loops at its
 * own length; `loop` = the duration of the whole loop, so its slots stretch to fit.
 */
export type TrackSync = 'slot' | 'loop';
export const TRACK_SYNCS: readonly TrackSync[] = ['slot', 'loop'];

export interface Track {
  id: string;
  nodes: SeqNode[];
  /** Missing means `slot` (tracks saved before there were several). Ignored on the master. */
  sync?: TrackSync;
}

/** Note value of one top-level slot: 4 = quarter, 8 = eighth, 16 = sixteenth. */
export type SlotValue = 4 | 8 | 16;

/** Playback speed relative to the BPM: ½×, 1× or 2×. */
export type TempoFactor = 0.5 | 1 | 2;
export const TEMPO_FACTORS: readonly TempoFactor[] = [0.5, 1, 2];

export interface Song {
  version: 1;
  bpm: number;
  slotValue: SlotValue;
  /** Missing means 1× (songs saved before the multiplier existed). */
  tempoFactor?: TempoFactor;
  /** Offbeat delay in slots, 0 to 0.75 (`SWING_MAX`); missing means straight. */
  swing?: number;
  tracks: Track[];
}

export interface Sound {
  id: SoundId;
  name: string;
  color: string;
  source: 'kit' | 'recording';
}

export type IdGen = () => string;

/** Deterministic id generator; inject it wherever ids are created so tests stay reproducible. */
export function createIdGen(prefix: string, start = 1): IdGen {
  let n = start;
  return () => `${prefix}${n++}`;
}

export function square(id: NodeId, soundId: SoundId | null, muted = false): Square {
  return { kind: 'square', id, soundId, muted };
}

export function group(id: NodeId, children: SeqNode[]): Group {
  return { kind: 'group', id, span: 1, children };
}

export function createSong(nextId: IdGen): Song {
  return { version: 1, bpm: 120, slotValue: 8, tracks: [{ id: nextId(), nodes: [] }] };
}
