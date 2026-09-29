import { describe, expect, it } from 'vitest';
import { group, square, type Track } from './model';
import { buildTimeline, leafAt } from './timeline';

const track = (nodes: Track['nodes']): Track => ({ id: 't', nodes });
const spans = (t: Track) => buildTimeline(t).leaves.map((l) => [l.nodeId, l.start, l.duration]);

describe('buildTimeline', () => {
  it('returns an empty timeline for an empty track', () => {
    expect(buildTimeline(track([]))).toEqual({ length: 0, leaves: [] });
  });

  it('gives each top-level square one slot', () => {
    const tl = buildTimeline(track([square('a', 'k'), square('b', 'k'), square('c', 'k')]));
    expect(tl.length).toBe(3);
    expect(tl.leaves.map((l) => [l.nodeId, l.start, l.duration])).toEqual([
      ['a', 0, 1],
      ['b', 1, 1],
      ['c', 2, 1],
    ]);
  });

  it('splits a group slot evenly among its children (triplet)', () => {
    const t = track([
      square('a', 'k'),
      group('g', [square('b', 'k'), square('c', 'k'), square('d', 'k')]),
      square('e', 'k'),
    ]);
    expect(buildTimeline(t).length).toBe(3);
    const [a, b, c, d, e] = spans(t);
    expect(a).toEqual(['a', 0, 1]);
    for (const [leaf, id, start] of [
      [b, 'b', 1],
      [c, 'c', 1 + 1 / 3],
      [d, 'd', 1 + 2 / 3],
    ] as const) {
      expect(leaf?.[0]).toBe(id);
      expect(leaf?.[1]).toBeCloseTo(start, 12);
      expect(leaf?.[2]).toBeCloseTo(1 / 3, 12);
    }
    expect(e).toEqual(['e', 2, 1]);
  });

  it('splits nested groups recursively', () => {
    const t = track([group('g', [square('x', 'k'), group('h', [square('y', 'k'), square('z', 'k')])])]);
    expect(spans(t)).toEqual([
      ['x', 0, 0.5],
      ['y', 0.5, 0.25],
      ['z', 0.75, 0.25],
    ]);
  });

  it('keeps silent and muted squares as inaudible leaves', () => {
    const tl = buildTimeline(track([square('a', 'k'), square('s', null), square('m', 'k', true)]));
    expect(tl.leaves.map(({ nodeId, soundId, audible }) => ({ nodeId, soundId, audible }))).toEqual([
      { nodeId: 'a', soundId: 'k', audible: true },
      { nodeId: 's', soundId: null, audible: false },
      { nodeId: 'm', soundId: 'k', audible: false },
    ]);
  });

  it('produces leaves only for squares, not for groups', () => {
    const t = track([group('g', [square('a', 'k'), square('b', 'k')])]);
    expect(buildTimeline(t).leaves.map((l) => l.nodeId)).toEqual(['a', 'b']);
  });

  it('does not mutate the track', () => {
    const t = track([square('a', 'k'), group('g', [square('b', 'k'), square('c', null)])]);
    const snapshot = structuredClone(t);
    buildTimeline(t);
    expect(t).toEqual(snapshot);
  });
});

describe('leafAt', () => {
  const tl = buildTimeline(
    track([square('a', 'k'), group('g', [square('b', 'k'), square('c', 'k'), square('d', 'k')])]),
  );
  const at = (p: number) => leafAt(tl, p)?.nodeId;

  it('returns the leaf containing the position, start inclusive and end exclusive', () => {
    expect(at(0)).toBe('a');
    expect(at(0.99)).toBe('a');
    expect(at(1)).toBe('b');
    expect(at(1.5)).toBe('c');
    expect(at(1.9)).toBe('d');
  });

  it('maps a position a hair below a third-boundary to the leaf starting there', () => {
    expect(at(1 + 1 / 3 - 1e-12)).toBe('c');
    expect(at(1 + 2 / 3 - 1e-12)).toBe('d');
  });

  it('returns undefined outside [0, length) and for an empty timeline', () => {
    expect(at(-0.5)).toBeUndefined();
    expect(at(2)).toBeUndefined();
    expect(at(7)).toBeUndefined();
    expect(leafAt(buildTimeline(track([])), 0)).toBeUndefined();
  });
});
