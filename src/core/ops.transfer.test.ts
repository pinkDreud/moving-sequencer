import { describe, expect, it } from 'vitest';
import { createIdGen, type NodeId } from './model';
import { findNode, nodeIds, transfer, type Placement } from './ops';
import { parseTrack, shape } from './test-helpers';

const at = (parentId: string | null, index: number): Placement => ({ at: { parentId, index } });

function run(from: string, to: string, ids: NodeId[], place: Placement, copy = false) {
  const src = parseTrack(from, 'src');
  const dst = parseTrack(to, 'dst');
  const r = transfer(src, dst, ids, place, { copy, nextId: createIdGen('N') });
  return { from: shape(r.from), to: shape(r.to), ids: r.ids, src, dst, r };
}

describe('transfer: move between tracks', () => {
  it('moves a square to the target and removes it from the source', () => {
    expect(run('A B C', 'X Y', ['B'], at(null, 1))).toMatchObject({ from: 'A C', to: 'X B Y', ids: ['B'] });
  });

  it('moves several nodes contiguously in document order, whatever the id order', () => {
    expect(run('A B C D', 'X', ['D', 'A', 'C'], at(null, 0))).toMatchObject({ from: 'B', to: 'A C D X' });
  });

  it('moves a group as a block; a selected descendant of it travels with it once', () => {
    expect(run('A G[B C] D', 'X', ['C', 'G'], at(null, 1))).toMatchObject({
      from: 'A D',
      to: 'X G[B C]',
      ids: ['G'],
    });
  });

  it('dissolves a source group left with one child', () => {
    expect(run('A G[B C]', 'X', ['B'], at(null, 1)).from).toBe('A C');
  });

  it('moves into a group of the target track', () => {
    expect(run('A B', 'X H[Y Z]', ['A'], at('H', 1)).to).toBe('X H[Y A Z]');
  });

  it('moves into an empty track', () => {
    expect(run('A B', '', ['B'], at(null, 0))).toMatchObject({ from: 'A', to: 'B' });
  });

  it('clamps the index to the end of the parent', () => {
    expect(run('A', 'X Y', ['A'], at(null, 99)).to).toBe('X Y A');
  });

  it('keeps the moved nodes (same objects, same ids)', () => {
    const { src, r } = run('A G[B C]', 'X', ['G'], at(null, 0));
    expect(r.to.nodes[0]).toBe(src.nodes[1]);
  });
});

describe('transfer: copy between tracks', () => {
  it('copies with fresh ids and leaves the source unchanged (same object)', () => {
    const { src, r, to, ids } = run('A B C', 'X Y', ['B'], at(null, 1), true);
    expect(r.from).toBe(src);
    expect(to).toBe('X N1 Y');
    expect(ids).toEqual(['N1']);
    expect(findNode(r.to, 'N1')).toMatchObject({ kind: 'square', soundId: 'kick', muted: false });
  });

  it('deep-clones a group: every node inside gets a fresh id, the structure and sounds stay', () => {
    const src = parseTrack('A G[B H[C D]]', 'src');
    const r = transfer(src, parseTrack('X', 'dst'), ['G'], at(null, 1), {
      copy: true,
      nextId: createIdGen('N'),
    });
    expect(shape(r.to)).toBe('X N1[N2 N3[N4 N5]]');
    const ids = nodeIds(r.to);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.some((id) => nodeIds(src).includes(id))).toBe(false);
  });

  it('keeps sound and mute of the copied squares', () => {
    const src = { id: 'src', nodes: [{ kind: 'square' as const, id: 'A', soundId: 'rim', muted: true }] };
    const r = transfer(src, parseTrack('X', 'dst'), ['A'], at(null, 0), {
      copy: true,
      nextId: createIdGen('N'),
    });
    expect(r.to.nodes[0]).toEqual({ kind: 'square', id: 'N1', soundId: 'rim', muted: true });
  });

  it('can copy the same nodes twice (a figure dropped several times)', () => {
    const src = parseTrack('A B', 'src');
    const nextId = createIdGen('N');
    const once = transfer(src, parseTrack('X', 'dst'), ['A', 'B'], at(null, 1), { copy: true, nextId });
    const twice = transfer(src, once.to, ['A', 'B'], at(null, 3), { copy: true, nextId });
    expect(shape(twice.to)).toBe('X N1 N2 N3 N4');
  });
});

describe('transfer: onto a square (combine)', () => {
  it('groups the moved square with the target square', () => {
    expect(run('A B', 'X Y Z', ['A'], { onto: 'Y' })).toMatchObject({ from: 'B', to: 'X N1[Y A] Z' });
  });

  it('a copied group absorbs the target square', () => {
    expect(run('G[A B]', 'X Y', ['G'], { onto: 'X' }, true).to).toBe('N1[X N2 N3] Y');
  });
});

describe('transfer: nothing to do', () => {
  const unchanged = (r: ReturnType<typeof run>) => {
    expect(r.r.from).toBe(r.src);
    expect(r.r.to).toBe(r.dst);
    expect(r.ids).toEqual([]);
  };

  it('no dragged id is in the source track', () => unchanged(run('A B', 'X', ['X', 'zz'], at(null, 0))));
  it('the target parent is missing', () => unchanged(run('A B', 'X', ['A'], at('nope', 0))));
  it('the target parent is a square', () => unchanged(run('A B', 'X', ['A'], at('X', 0))));
  it('the combine target is missing', () => unchanged(run('A B', 'X', ['A'], { onto: 'nope' })));
});
