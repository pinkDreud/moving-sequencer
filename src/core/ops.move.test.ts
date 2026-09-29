import { describe, expect, it } from 'vitest';
import { findNode, move, nodeIds, normalize } from './ops';
import { parseTrack, shape } from './test-helpers';

const root = (index: number) => ({ parentId: null, index });
const moved = (spec: string, ids: string[], parentId: string | null, index: number) =>
  shape(move(parseTrack(spec), ids, { parentId, index }));

describe('move: single node', () => {
  it('moves a square forward', () => {
    expect(moved('A B C D', ['A'], null, 3)).toBe('B C A D');
  });

  it('moves a square backward', () => {
    expect(moved('A B C D', ['D'], null, 1)).toBe('A D B C');
  });

  it('moves a square to the end', () => {
    expect(moved('A B C D', ['B'], null, 4)).toBe('A C D B');
  });

  it('moves a square to the start', () => {
    expect(moved('A B C D', ['C'], null, 0)).toBe('C A B D');
  });

  it('returns the same track when dropped on its own position (before or after itself)', () => {
    const t = parseTrack('A B C D');
    expect(move(t, ['B'], root(1))).toBe(t);
    expect(move(t, ['B'], root(2))).toBe(t);
  });

  it('clamps an out-of-range index', () => {
    expect(moved('A B C', ['A'], null, 99)).toBe('B C A');
    expect(moved('A B C', ['C'], null, -5)).toBe('C A B');
  });
});

describe('move: multi-select', () => {
  it('moves three contiguous squares after the last one keeping their order', () => {
    expect(moved('A B C D E', ['B', 'C', 'D'], null, 5)).toBe('A E B C D');
  });

  it('lands non-contiguous squares contiguously in document order at the end', () => {
    expect(moved('A B C D E', ['D', 'B'], null, 5)).toBe('A C E B D');
  });

  it('lands non-contiguous squares contiguously in document order at the start', () => {
    expect(moved('A B C D E', ['D', 'B'], null, 0)).toBe('B D A C E');
  });

  it('counts only the moved nodes before the target index', () => {
    expect(moved('A B C D E', ['B', 'D'], null, 3)).toBe('A C B D E');
  });

  it('returns the same track when a contiguous selection is dropped inside itself', () => {
    const t = parseTrack('A B C D E');
    for (const index of [1, 2, 3, 4]) expect(move(t, ['B', 'C', 'D'], root(index))).toBe(t);
  });

  it('returns the same track when every node is moved at the root', () => {
    const t = parseTrack('A B C');
    expect(move(t, ['A', 'B', 'C'], root(3))).toBe(t);
  });

  it('ignores unknown and duplicate ids', () => {
    expect(moved('A B C D', ['A', 'nope', 'A'], null, 4)).toBe('B C D A');
  });
});

describe('move: groups as blocks', () => {
  it('moves a group with its children, keeping its id and content', () => {
    const t = parseTrack('A G[B H[C D]] E');
    const out = move(t, ['G'], root(3));
    expect(shape(out)).toBe('A E G[B H[C D]]');
    expect(findNode(out, 'G')).toBe(findNode(t, 'G'));
  });

  it('moves a group and a square together in document order', () => {
    expect(moved('A G[B C] D E', ['E', 'G'], null, 0)).toBe('G[B C] E A D');
  });

  it('moves only the group when a group and one of its descendants are selected', () => {
    expect(moved('A G[B C] D', ['B', 'G'], null, 3)).toBe('A D G[B C]');
  });

  it('reorders children inside a group like at the root', () => {
    expect(moved('A G[B C D]', ['B'], 'G', 3)).toBe('A G[C D B]');
    expect(moved('A G[B C D]', ['D', 'B'], 'G', 2)).toBe('A G[C B D]');
  });
});

describe('move: no-ops', () => {
  const t = parseTrack('A G[B H[C D]] E');

  it('returns the same track for empty or unknown ids', () => {
    expect(move(t, [], root(0))).toBe(t);
    expect(move(t, ['nope'], root(0))).toBe(t);
  });

  it('returns the same track when the target parent does not exist or is a square', () => {
    expect(move(t, ['A'], { parentId: 'nope', index: 0 })).toBe(t);
    expect(move(t, ['E'], { parentId: 'A', index: 0 })).toBe(t);
  });

  it('returns the same track when the target parent is a moved group or inside one', () => {
    expect(move(t, ['G'], { parentId: 'G', index: 0 })).toBe(t);
    expect(move(t, ['G'], { parentId: 'H', index: 1 })).toBe(t);
    expect(move(t, ['A', 'G'], { parentId: 'H', index: 1 })).toBe(t);
  });
});

describe('move: invariants', () => {
  it('returns a normalized track with unique ids and shares untouched subtrees', () => {
    const t = parseTrack('A G[B C] D E');
    const out = move(t, ['E'], root(0));
    expect(shape(out)).toBe('E A G[B C] D');
    expect(normalize(out)).toBe(out);
    expect(new Set(nodeIds(out)).size).toBe(nodeIds(out).length);
    expect(out.nodes[2]).toBe(t.nodes[1]);
  });

  it('does not mutate its deep-frozen input', () => {
    const t = parseTrack('A G[B H[C D]] E');
    const before = JSON.stringify(t);
    move(t, ['C', 'A'], { parentId: 'G', index: 0 });
    move(t, ['E'], root(0));
    expect(JSON.stringify(t)).toBe(before);
  });
});
