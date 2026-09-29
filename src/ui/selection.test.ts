import { describe, expect, it } from 'vitest';
import { square } from '../core/model';
import { parseTrack, shape } from '../core/test-helpers';
import { allMuted, canGroup, selectMode, selectedGroupIds, ungroupAll } from './selection';

const pointer = (
  pointerType: string,
  mods: Partial<{ shiftKey: boolean; metaKey: boolean; ctrlKey: boolean }> = {},
) => ({
  pointerType,
  shiftKey: false,
  metaKey: false,
  ctrlKey: false,
  ...mods,
});

describe('selectMode', () => {
  it('replaces the selection on a plain mouse or keyboard click', () => {
    expect(selectMode(pointer('mouse'))).toBe('replace');
    expect(selectMode(pointer(''))).toBe('replace');
  });

  it('toggles with shift, cmd or ctrl held', () => {
    expect(selectMode(pointer('mouse', { shiftKey: true }))).toBe('toggle');
    expect(selectMode(pointer('mouse', { metaKey: true }))).toBe('toggle');
    expect(selectMode(pointer('mouse', { ctrlKey: true }))).toBe('toggle');
  });

  it('toggles on a touch tap', () => {
    expect(selectMode(pointer('touch'))).toBe('toggle');
  });

  it('toggles on a pen tap, since a tablet has no modifier keys', () => {
    expect(selectMode(pointer('pen'))).toBe('toggle');
  });
});

describe('canGroup', () => {
  it('is true for two or more siblings', () => {
    expect(canGroup(parseTrack('A B C'), new Set(['A', 'C']))).toBe(true);
    expect(canGroup(parseTrack('A G[B C D]'), new Set(['B', 'C']))).toBe(true);
  });

  it('is false for fewer than two nodes, unrelated places, or every child of a group', () => {
    expect(canGroup(parseTrack('A B'), new Set(['A']))).toBe(false);
    expect(canGroup(parseTrack('G[A B] H[C D]'), new Set(['A', 'C']))).toBe(false);
    expect(canGroup(parseTrack('A G[B C]'), new Set(['B', 'C']))).toBe(false);
  });

  it('is true for a square next to a group plus a square inside it (it joins the group)', () => {
    expect(canGroup(parseTrack('A G[B C]'), new Set(['A', 'B']))).toBe(true);
  });
});

describe('selectedGroupIds', () => {
  it('lists the selected groups in document order, outer first', () => {
    const track = parseTrack('A H[B I[C D]] G[E F]');
    expect(selectedGroupIds(track, new Set(['G', 'A', 'I', 'H', 'E']))).toEqual(['H', 'I', 'G']);
  });
});

describe('ungroupAll', () => {
  it('ungroups every group and returns their former children', () => {
    const { track, childIds } = ungroupAll(parseTrack('A G[B C] D H[E F]'), ['G', 'H']);
    expect(shape(track)).toBe('A B C D E F');
    expect(childIds).toEqual(['B', 'C', 'E', 'F']);
  });

  it('handles nested groups: an ungrouped inner group is replaced by its children', () => {
    const { track, childIds } = ungroupAll(parseTrack('G[A I[B C]]'), ['G', 'I']);
    expect(shape(track)).toBe('A B C');
    expect(childIds).toEqual(['A', 'B', 'C']);
  });

  it('ungroups only the outer group when the inner one is not listed', () => {
    const { track, childIds } = ungroupAll(parseTrack('G[A I[B C]] D'), ['G']);
    expect(shape(track)).toBe('A I[B C] D');
    expect(childIds).toEqual(['A', 'I']);
  });
});

describe('allMuted', () => {
  const track = {
    id: 't',
    nodes: [square('a', 'kick', true), square('b', 'hat', false), square('c', 'hat', true)],
  };

  it('is true when every targeted square is muted', () => {
    expect(allMuted(track, new Set(['a', 'c']))).toBe(true);
  });

  it('is false when one targeted square is not muted, or nothing is targeted', () => {
    expect(allMuted(track, new Set(['a', 'b']))).toBe(false);
    expect(allMuted(track, new Set())).toBe(false);
  });

  it('looks at every square below a selected group', () => {
    const nested = {
      id: 't',
      nodes: [{ kind: 'group' as const, id: 'g', span: 1 as const, children: track.nodes }],
    };
    expect(allMuted(nested, new Set(['g']))).toBe(false);
  });
});
