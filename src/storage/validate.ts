// Checks data read back from storage. Anything unexpected is rejected as a whole (null), never half-loaded:
// it may come from an older bug, a future version or another app on the same origin.
import {
  group,
  square,
  TEMPO_FACTORS,
  type SeqNode,
  type SlotValue,
  type Song,
  type Sound,
  type Track,
} from '../core/model';
import { normalize } from '../core/ops';
import { SWING_MAX } from '../core/timing';

const SLOT_VALUES: readonly SlotValue[] = [4, 8, 16];

type Loose = Record<string, unknown>;

const isObject = (value: unknown): value is Loose =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** Signals invalid data from deep inside the recursion; caught by the parse functions. */
class Invalid extends Error {}

function fail(): never {
  throw new Invalid();
}

function str(value: unknown): string {
  return typeof value === 'string' ? value : fail();
}

/** Group nesting accepted from storage: the UI renders groups recursively. */
export const MAX_DEPTH = 32;
/** Nodes accepted from storage, across all tracks. */
export const MAX_NODES = 10_000;

/**
 * Maps every index, holes included: structured clone keeps array holes, and `map` would skip them (and leave an
 * `undefined` node for the timeline and the UI to trip over).
 */
function each<T>(items: unknown[], parse: (item: unknown) => T): T[] {
  return Array.from(items, parse);
}

function claim(id: string, ids: Set<string>): void {
  if (ids.has(id) || ids.size >= MAX_NODES) fail();
  ids.add(id);
}

function parseNode(value: unknown, ids: Set<string>, depth: number): SeqNode {
  if (!isObject(value)) fail();
  const id = str(value.id);
  claim(id, ids);
  if (value.kind === 'square') {
    const { soundId, muted } = value;
    if (soundId !== null && typeof soundId !== 'string') fail();
    if (typeof muted !== 'boolean') fail();
    return square(id, soundId, muted);
  }
  if (value.kind === 'group') {
    if (value.span !== 1 || !Array.isArray(value.children) || depth >= MAX_DEPTH) fail();
    return group(
      id,
      each(value.children, (child) => parseNode(child, ids, depth + 1)),
    );
  }
  return fail();
}

function parseTrack(value: unknown, ids: Set<string>): Track {
  if (!isObject(value) || !Array.isArray(value.nodes)) fail();
  const id = str(value.id);
  claim(id, ids);
  const nodes = each(value.nodes, (node) => parseNode(node, ids, 0));
  return normalize({ id, nodes });
}

/** A stored song as a clean, normalized `Song`, or null if it is not a valid version-1 song. */
export function parseSong(data: unknown): Song | null {
  try {
    if (!isObject(data) || data.version !== 1) return null;
    const { bpm, slotValue, tempoFactor, swing, tracks } = data;
    if (typeof bpm !== 'number' || !Number.isInteger(bpm) || bpm < 30 || bpm > 300) return null;
    const slot = SLOT_VALUES.find((v) => v === slotValue);
    if (slot === undefined || !Array.isArray(tracks) || tracks.length === 0) return null;
    const factor = TEMPO_FACTORS.find((f) => f === tempoFactor);
    if (tempoFactor !== undefined && factor === undefined) return null;
    if (swing !== undefined && !(typeof swing === 'number' && swing >= 0 && swing <= SWING_MAX)) return null;
    const ids = new Set<string>();
    const song: Song = { version: 1, bpm, slotValue: slot, tracks: each(tracks, (t) => parseTrack(t, ids)) };
    // Missing optional fields stay missing, so older saves round-trip unchanged.
    if (factor !== undefined) song.tempoFactor = factor;
    if (swing !== undefined) song.swing = swing;
    return song;
  } catch (error) {
    if (error instanceof Invalid) return null;
    throw error;
  }
}

/** A recording as stored: the sound, its audio bytes and type, and when it was saved (for ordering). */
export interface RecordingRecord {
  sound: Sound;
  type: string;
  data: ArrayBuffer;
  savedAt: number;
}

/** A stored recording record as a clean copy, or null if it is not one. */
export function parseRecordingRecord(value: unknown): RecordingRecord | null {
  if (!isObject(value) || !isObject(value.sound)) return null;
  const { id, name, color, source } = value.sound;
  const { type, data, savedAt } = value;
  if (typeof id !== 'string' || !id.startsWith('rec-') || source !== 'recording') return null;
  if (typeof name !== 'string' || typeof color !== 'string' || typeof type !== 'string') return null;
  if (!(data instanceof ArrayBuffer) || typeof savedAt !== 'number' || !Number.isFinite(savedAt)) return null;
  return { sound: { id, name, color, source }, type, data, savedAt };
}
