// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { group, square, type SeqNode, type Song } from '../core/model';
import { parseRecordingRecord, parseSong } from './validate';

const valid = (): Song => ({
  version: 1,
  bpm: 110,
  slotValue: 8,
  tracks: [
    {
      id: 't1',
      nodes: [
        square('a', 'kick'),
        group('g', [square('b', null), square('c', 'rec-x', true)]),
        square('d', 'hat'),
      ],
    },
  ],
});

type Loose = Record<string, unknown>;

/** A deep copy of a valid song with `edit` applied (to the song and its first track), as untyped stored data. */
function tweak(edit: (song: Loose, track: Loose) => void): unknown {
  const copy = structuredClone(valid()) as unknown as Loose & { tracks: Loose[] };
  const [track] = copy.tracks;
  if (!track) throw new Error('no track');
  edit(copy, track);
  return copy;
}

/** A copy of `items` with index `at` left empty (a hole, as structured clone keeps them). */
function withHole<T>(items: T[], at: number): T[] {
  const out = [...items];
  delete out[at];
  return out;
}

/** `depth` groups nested inside each other around two squares. */
function nested(depth: number): SeqNode {
  let node: SeqNode = group('g0', [square('a0', null), square('b0', null)]);
  for (let i = 1; i < depth; i++) node = group(`g${i}`, [node, square(`s${i}`, null)]);
  return node;
}

describe('parseSong', () => {
  it('accepts groups nested 32 deep', () => {
    expect(parseSong(tweak((_, t) => (t.nodes = [nested(32)])))).not.toBeNull();
  });

  it('accepts a valid song and returns an equal copy', () => {
    const data = valid();
    const song = parseSong(data);
    expect(song).toEqual(valid());
    expect(song).not.toBe(data);
  });

  it('drops unknown fields', () => {
    const data = tweak((s, t) => {
      s.extra = 1;
      t.nodes = [{ ...square('a', 'kick'), color: 'red' }, square('d', 'hat')];
    });
    const song = parseSong(data);
    expect(song).not.toHaveProperty('extra');
    expect(song?.tracks[0]?.nodes[0]).toEqual(square('a', 'kick'));
  });

  it('normalizes the loaded tracks', () => {
    const data = tweak((_, t) => {
      t.nodes = [square('a', 'kick'), group('g', [square('b', 'hat')]), group('e', [])];
    });
    expect(parseSong(data)?.tracks[0]?.nodes).toEqual([square('a', 'kick'), square('b', 'hat')]);
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a string', 'song'],
    ['an array', []],
    ['a future version', tweak((s) => (s.version = 2))],
    ['no version', tweak((s) => delete s.version)],
    ['a bpm below 30', tweak((s) => (s.bpm = 29))],
    ['a bpm above 300', tweak((s) => (s.bpm = 301))],
    ['a fractional bpm', tweak((s) => (s.bpm = 120.5))],
    ['a bpm that is not a number', tweak((s) => (s.bpm = '120'))],
    ['an unknown slot value', tweak((s) => (s.slotValue = 3))],
    ['no tracks', tweak((s) => (s.tracks = []))],
    ['tracks that are not an array', tweak((s) => (s.tracks = {}))],
    ['a track without an id', tweak((_, t) => delete t.id)],
    ['a track without nodes', tweak((_, t) => delete t.nodes)],
    ['an unknown node kind', tweak((_, t) => (t.nodes = [{ kind: 'note', id: 'z' }]))],
    ['a square with a numeric sound', tweak((_, t) => (t.nodes = [{ ...square('z', null), soundId: 3 }]))],
    ['a square without muted', tweak((_, t) => (t.nodes = [{ kind: 'square', id: 'z', soundId: null }]))],
    ['a node without an id', tweak((_, t) => (t.nodes = [{ ...square('z', null), id: 5 }]))],
    ['a group with span 2', tweak((_, t) => (t.nodes = [{ ...group('z', []), span: 2 }]))],
    ['a group without children', tweak((_, t) => (t.nodes = [{ kind: 'group', id: 'z', span: 1 }]))],
    [
      'a duplicate node id',
      tweak((_, t) => (t.nodes = [square('a', null), group('g', [square('a', null)])])),
    ],
    ['a node id equal to the track id', tweak((_, t) => (t.nodes = [square('t1', null)]))],
    ['a hole in the tracks', tweak((s) => (s.tracks = new Array(1)))],
    ['a hole in the nodes', tweak((_, t) => (t.nodes = withHole([square('y', null), square('z', null)], 0)))],
    [
      'a hole in the children of a group',
      tweak(
        (_, t) =>
          (t.nodes = [
            {
              ...group('g', []),
              children: withHole([square('x', null), square('y', null), square('z', null)], 1),
            },
          ]),
      ),
    ],
    ['groups nested deeper than 32', tweak((_, t) => (t.nodes = [nested(33)]))],
    [
      'more than 10 000 nodes',
      tweak((_, t) => (t.nodes = Array.from({ length: 10_001 }, (_, i) => square(`n${i}`, null)))),
    ],
  ])('rejects %s', (_, data) => {
    expect(parseSong(data)).toBeNull();
  });
});

describe('parseSong tempo factor', () => {
  it('accepts ½×, 1× and 2×', () => {
    for (const f of [0.5, 1, 2]) expect(parseSong(tweak((s) => (s.tempoFactor = f)))?.tempoFactor).toBe(f);
  });

  it('leaves a missing factor missing (older saves: it means 1×)', () => {
    expect(parseSong(valid())?.tempoFactor).toBeUndefined();
  });

  it('rejects any other factor', () => {
    for (const f of [3, 0, -1, '2', null]) expect(parseSong(tweak((s) => (s.tempoFactor = f)))).toBeNull();
  });
});

describe('parseRecordingRecord', () => {
  const record = () => ({
    sound: { id: 'rec-a', name: 'Rec 1', color: '#fff', source: 'recording' },
    type: 'audio/webm',
    data: new Uint8Array([1, 2]).buffer,
    savedAt: 5,
  });

  it('accepts a stored recording and returns a clean copy', () => {
    const data = { ...record(), extra: true };
    const parsed = parseRecordingRecord(data);
    expect(parsed).toEqual(record());
    expect(parsed).not.toHaveProperty('extra');
  });

  it.each<[string, unknown]>([
    ['null', null],
    ['a kit sound', { ...record(), sound: { ...record().sound, source: 'kit' } }],
    ['an id without rec-', { ...record(), sound: { ...record().sound, id: 'kick' } }],
    ['a sound without a name', { ...record(), sound: { ...record().sound, name: 1 } }],
    ['a sound without a color', { ...record(), sound: { id: 'rec-a', name: 'Rec 1', source: 'recording' } }],
    ['data that is not an ArrayBuffer', { ...record(), data: 'bytes' }],
    ['a type that is not a string', { ...record(), type: null }],
    ['no savedAt', { ...record(), savedAt: undefined }],
    ['a savedAt that is not finite', { ...record(), savedAt: Number.NaN }],
  ])('rejects %s', (_, data) => {
    expect(parseRecordingRecord(data)).toBeNull();
  });
});
