import { describe, expect, it } from 'vitest';
import { createIdGen } from './model';
import { combine, groupOrJoin } from './ops';
import { parseTrack, shape } from './test-helpers';

const run = (spec: string, ids: string[]) => {
  const r = groupOrJoin(parseTrack(spec), ids, createIdGen('N'));
  return { shape: shape(r.track), groupId: r.groupId };
};

describe('groupOrJoin: new groups (plain Group behaviour)', () => {
  it('groups sibling squares into a new group', () => {
    expect(run('A B C D', ['B', 'C'])).toEqual({ shape: 'A N1[B C] D', groupId: 'N1' });
  });

  it('squares all inside one group make a sub-group (explicit nesting)', () => {
    expect(run('A G[B C D] E', ['B', 'C'])).toEqual({ shape: 'A G[N1[B C] D] E', groupId: 'N1' });
  });

  it('two groups are wrapped in a new group', () => {
    expect(run('G[A B] H[C D] E', ['G', 'H'])).toEqual({ shape: 'N1[G[A B] H[C D]] E', groupId: 'N1' });
  });
});

describe('groupOrJoin: joining an existing group', () => {
  it('a group plus a square after it: the square joins at the end', () => {
    expect(run('A G[B C] D', ['G', 'D'])).toEqual({ shape: 'A G[B C D]', groupId: 'G' });
  });

  it('a group plus a square before it: the square joins at the start', () => {
    expect(run('A G[B C] D', ['A', 'G'])).toEqual({ shape: 'G[A B C] D', groupId: 'G' });
  });

  it('a square inside a group plus a square outside it: the outside one joins the group', () => {
    expect(run('A G[B C] D', ['B', 'D'])).toEqual({ shape: 'A G[B C D]', groupId: 'G' });
  });

  it('keeps timeline order when several squares join from both sides', () => {
    expect(run('A B G[C D] E F', ['A', 'C', 'F', 'B'])).toEqual({ shape: 'G[A B C D] E F', groupId: 'G' });
    expect(run('A G[C D] E F', ['A', 'G', 'E', 'F'])).toEqual({ shape: 'G[A C D E F]', groupId: 'G' });
  });

  it('joins a nested group when the outside squares are its siblings', () => {
    expect(run('G[A H[B C] D]', ['C', 'D'])).toEqual({ shape: 'G[A H[B C D]]', groupId: 'H' });
  });

  it('squares from unrelated places do nothing', () => {
    expect(run('G[A B] H[C D]', ['A', 'C'])).toEqual({ shape: 'G[A B] H[C D]', groupId: null });
  });

  it('fewer than two nodes does nothing', () => {
    expect(run('A G[B C]', ['G'])).toEqual({ shape: 'A G[B C]', groupId: null });
  });
});

describe('combine (drop a square onto another square)', () => {
  const comb = (spec: string, ids: string[], target: string) =>
    shape(combine(parseTrack(spec), ids, target, createIdGen('N')));

  it('dropping a square onto another groups them, dragged after the target', () => {
    expect(comb('A B C D', ['D'], 'B')).toBe('A N1[B D] C');
    expect(comb('A B C D', ['A'], 'C')).toBe('B N1[C A] D');
  });

  it('several dragged squares join in document order', () => {
    expect(comb('A B C D', ['D', 'A'], 'B')).toBe('N1[B A D] C');
  });

  it('a square dragged out of a group onto another square', () => {
    expect(comb('G[A B C] D', ['A'], 'D')).toBe('G[B C] N1[D A]');
  });

  it('a dragged group absorbs the target square (join rule)', () => {
    expect(comb('A G[B C] D', ['G'], 'D')).toBe('A G[D B C]');
  });

  it('dropping onto one of the dragged squares does nothing', () => {
    const t = parseTrack('A B C');
    expect(combine(t, ['A', 'B'], 'B', createIdGen('N'))).toBe(t);
  });
});
