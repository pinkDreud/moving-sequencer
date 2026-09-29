import { describe, expect, it, vi } from 'vitest';
import { createIdGen, type NodeId } from './model';
import { findNode, group, move, nodeIds, normalize, ungroup } from './ops';
import { parseTrack, shape } from './test-helpers';

const grouped = (spec: string, ids: NodeId[]) => {
  const { track, groupId } = group(parseTrack(spec), ids, createIdGen('g'));
  return { shape: shape(track), groupId };
};
const moved = (spec: string, ids: NodeId[], parentId: NodeId | null, index: number) =>
  shape(move(parseTrack(spec), ids, { parentId, index }));

describe('group', () => {
  it('wraps two adjacent root squares into a new group in their place', () => {
    expect(grouped('A B C D', ['B', 'C'])).toEqual({ shape: 'A g1[B C] D', groupId: 'g1' });
  });

  it('places the group at the first selected node, children in document order', () => {
    expect(grouped('A B C D E', ['D', 'B'])).toEqual({ shape: 'A g1[B D] C E', groupId: 'g1' });
  });

  it('nests a new group inside an existing group', () => {
    expect(grouped('A G[B C D]', ['C', 'D']).shape).toBe('A G[B g1[C D]]');
  });

  it('groups a group together with a square', () => {
    expect(grouped('G[A B] C', ['G', 'C']).shape).toBe('g1[G[A B] C]');
  });

  it('groups every root node into one group holding the whole pattern', () => {
    expect(grouped('A B C', ['A', 'B', 'C']).shape).toBe('g1[A B C]');
  });

  it('ignores unknown ids and counts duplicates once', () => {
    expect(grouped('A B C', ['B', 'nope', 'C', 'B']).shape).toBe('A g1[B C]');
  });

  it('takes one id from the generator per created group', () => {
    const nextId = createIdGen('g');
    const first = group(parseTrack('A B C D'), ['A', 'B'], nextId);
    const second = group(first.track, ['C', 'D'], nextId);
    expect(shape(second.track)).toBe('g1[A B] g2[C D]');
    expect(second.groupId).toBe('g2');
  });

  describe('is a no-op (same track, null id, generator untouched)', () => {
    const cases: [string, string, NodeId[]][] = [
      ['a single node', 'A B C', ['B']],
      ['a single node selected twice', 'A B C', ['B', 'B']],
      ['nothing', 'A B C', []],
      ['unknown ids', 'A B C', ['x', 'y']],
      ['nodes with different parents', 'A G[B C]', ['A', 'B']],
      ['every child of a group', 'A G[B C]', ['B', 'C']],
    ];
    for (const [label, spec, ids] of cases) {
      it(`when selecting ${label}`, () => {
        const t = parseTrack(spec);
        const nextId = vi.fn(createIdGen('g'));
        expect(group(t, ids, nextId)).toEqual({ track: t, groupId: null });
        expect(group(t, ids, nextId).track).toBe(t);
        expect(nextId).not.toHaveBeenCalled();
      });
    }
  });
});

describe('ungroup', () => {
  it('puts the children in place of a root group', () => {
    expect(shape(ungroup(parseTrack('A G[B C] D'), 'G'))).toBe('A B C D');
  });

  it('puts the children in place of a nested group, inside its parent group', () => {
    expect(shape(ungroup(parseTrack('A G[B H[C D]]'), 'H'))).toBe('A G[B C D]');
  });

  it('keeps nested groups when ungrouping their parent', () => {
    expect(shape(ungroup(parseTrack('A G[B H[C D]]'), 'G'))).toBe('A B H[C D]');
  });

  it('returns the same track for an unknown id or a square id', () => {
    const t = parseTrack('A G[B C]');
    expect(ungroup(t, 'nope')).toBe(t);
    expect(ungroup(t, 'B')).toBe(t);
  });

  it('undoes group', () => {
    const t = parseTrack('A B G[C D] E');
    const { track, groupId } = group(t, ['E', 'B'], createIdGen('g'));
    expect(shape(track)).toBe('A g1[B E] G[C D]');
    expect(shape(ungroup(track, groupId ?? ''))).toBe('A B E G[C D]');
    const adjacent = group(t, ['B', 'G'], createIdGen('g'));
    expect(ungroup(adjacent.track, adjacent.groupId ?? '')).toEqual(t);
  });
});

describe('move into and out of groups', () => {
  it('moves a square into a group', () => {
    expect(moved('A B G[C D]', ['A'], 'G', 1)).toBe('B G[C A D]');
  });

  it('dissolves a 2-child group when one child moves out', () => {
    expect(moved('A G[B C] D', ['B'], null, 0)).toBe('B A C D');
  });

  it('moves a child out to just after its group', () => {
    expect(moved('A G[B C] D', ['B'], null, 2)).toBe('A C B D');
  });

  it('removes a group when all its children move out', () => {
    expect(moved('A G[B C] D', ['B', 'C'], null, 4)).toBe('A D B C');
  });

  it('dissolves only the nested group a child leaves', () => {
    expect(moved('G[A H[B C]]', ['B'], 'G', 0)).toBe('G[B A C]');
  });

  it('nests a group into another group as one block', () => {
    const t = parseTrack('G[A B] H[C D]');
    const out = move(t, ['G'], { parentId: 'H', index: 1 });
    expect(shape(out)).toBe('H[C G[A B] D]');
    expect(findNode(out, 'G')).toBe(findNode(t, 'G'));
  });

  it('is a no-op when moving a group into itself or into one of its descendants', () => {
    const t = parseTrack('A G[B H[C D]]');
    expect(move(t, ['G'], { parentId: 'G', index: 1 })).toBe(t);
    expect(move(t, ['G'], { parentId: 'H', index: 0 })).toBe(t);
  });

  it('gathers nodes from different parents in document order', () => {
    expect(moved('A G[B C D] E', ['E', 'B'], null, 0)).toBe('B E A G[C D]');
  });

  it('adjusts the index only for moved children of the target group', () => {
    expect(moved('A G[B C]', ['A', 'B'], 'G', 2)).toBe('G[C A B]');
  });
});

describe('group invariants', () => {
  it('returns normalized tracks with unique ids', () => {
    const t = parseTrack('A G[B H[C D]] E');
    const outs = [
      group(t, ['A', 'E'], createIdGen('g')).track,
      ungroup(t, 'G'),
      move(t, ['C'], { parentId: null, index: 0 }),
      move(t, ['E'], { parentId: 'H', index: 1 }),
    ];
    for (const out of outs) {
      expect(normalize(out)).toBe(out);
      expect(new Set(nodeIds(out)).size).toBe(nodeIds(out).length);
    }
  });

  it('does not mutate its deep-frozen input', () => {
    const t = parseTrack('A G[B H[C D]] E');
    const before = JSON.stringify(t);
    group(t, ['B', 'H'], createIdGen('g'));
    ungroup(t, 'H');
    move(t, ['D'], { parentId: null, index: 0 });
    expect(JSON.stringify(t)).toBe(before);
  });
});
