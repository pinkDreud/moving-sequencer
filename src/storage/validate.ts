// Checks data read back from storage. Anything unexpected is rejected as a whole (null), never half-loaded:
// it may come from an older bug, a future version or another app on the same origin.
import {
  group,
  square,
  type SeqNode,
  type SlotValue,
  type Song,
  type Sound,
  type Track,
} from '../core/model';
import { normalize } from '../core/ops';

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

function parseNode(value: unknown, ids: Set<string>): SeqNode {
  if (!isObject(value)) fail();
  const id = str(value.id);
  if (ids.has(id)) fail();
  ids.add(id);
  if (value.kind === 'square') {
    const { soundId, muted } = value;
    if (soundId !== null && typeof soundId !== 'string') fail();
    if (typeof muted !== 'boolean') fail();
    return square(id, soundId, muted);
  }
  if (value.kind === 'group') {
    if (value.span !== 1 || !Array.isArray(value.children)) fail();
    return group(
      id,
      value.children.map((child) => parseNode(child, ids)),
    );
  }
  return fail();
}

function parseTrack(value: unknown, ids: Set<string>): Track {
  if (!isObject(value) || !Array.isArray(value.nodes)) fail();
  const id = str(value.id);
  if (ids.has(id)) fail();
  ids.add(id);
  const nodes = value.nodes.map((node) => parseNode(node, ids));
  return normalize({ id, nodes });
}

/** A stored song as a clean, normalized `Song`, or null if it is not a valid version-1 song. */
export function parseSong(data: unknown): Song | null {
  try {
    if (!isObject(data) || data.version !== 1) return null;
    const { bpm, slotValue, tracks } = data;
    if (typeof bpm !== 'number' || !Number.isInteger(bpm) || bpm < 30 || bpm > 300) return null;
    const slot = SLOT_VALUES.find((v) => v === slotValue);
    if (slot === undefined || !Array.isArray(tracks) || tracks.length === 0) return null;
    const ids = new Set<string>();
    return { version: 1, bpm, slotValue: slot, tracks: tracks.map((t) => parseTrack(t, ids)) };
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
  if (!(data instanceof ArrayBuffer) || typeof savedAt !== 'number') return null;
  return { sound: { id, name, color, source }, type, data, savedAt };
}
