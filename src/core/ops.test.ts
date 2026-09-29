import { describe, expect, it } from 'vitest';
import { group, square, type Group, type Square, type Track } from './model';
import { findLocation, findNode, insert, nodeIds, normalize, remove, setSound, toggleMute } from './ops';
import { deepFreeze, parseTrack, shape } from './test-helpers';

const sq = (id: string): Square => square(id, 'kick');
const frozen = (nodes: Track['nodes']): Track => deepFreeze({ id: 't', nodes });

/** Sound and mute state of every square, in document order: `A:kick`, `B:-` (silent), `C:kick~` (muted). */
function sounds(track: Track): string[] {
  return nodeIds(track).flatMap((id) => {
    const n = findNode(track, id);
    return n?.kind === 'square' ? [`${n.id}:${n.soundId ?? '-'}${n.muted ? '~' : ''}`] : [];
  });
}

describe('normalize', () => {
  it('removes a group with no children', () => {
    expect(shape(normalize(frozen([sq('A'), group('G', []), sq('B')])))).toBe('A B');
  });

  it('replaces a single-child group by its child at the same position', () => {
    expect(shape(normalize(frozen([sq('A'), group('G', [sq('B')]), sq('C')])))).toBe('A B C');
  });

  it('removes a group whose only child is an empty group', () => {
    expect(shape(normalize(frozen([sq('A'), group('G', [group('H', [])])])))).toBe('A');
  });

  it('collapses a chain of single-child groups to the leaf', () => {
    expect(shape(normalize(frozen([group('G', [group('H', [group('I', [sq('A')])])])])))).toBe('A');
  });

  it('unwraps a group left with one child after its empty sub-group is removed', () => {
    expect(shape(normalize(frozen([group('G', [sq('A'), group('H', [])]), sq('B')])))).toBe('A B');
  });

  it('unwraps a single-child group whose only child is a group', () => {
    const t = frozen([group('G', [sq('A'), group('H', [group('I', [sq('B'), sq('C')])])])]);
    expect(shape(normalize(t))).toBe('G[A I[B C]]');
  });

  it('returns the same track object when it is already normal', () => {
    const t = parseTrack('A G[B H[C D]] E');
    expect(normalize(t)).toBe(t);
  });

  it('keeps the identity of untouched subtrees', () => {
    const t = frozen([group('G', [sq('A'), sq('B')]), group('H', [sq('C')])]);
    const out = normalize(t);
    expect(out.nodes[0]).toBe(t.nodes[0]);
  });
});

describe('insert', () => {
  it('inserts at the start of the root', () => {
    expect(shape(insert(parseTrack('A B'), { parentId: null, index: 0 }, sq('X')))).toBe('X A B');
  });

  it('inserts in the middle of the root', () => {
    expect(shape(insert(parseTrack('A B'), { parentId: null, index: 1 }, sq('X')))).toBe('A X B');
  });

  it('appends when index equals the length', () => {
    expect(shape(insert(parseTrack('A B'), { parentId: null, index: 2 }, sq('X')))).toBe('A B X');
  });

  it('inserts into an empty track', () => {
    expect(shape(insert(parseTrack(''), { parentId: null, index: 0 }, sq('X')))).toBe('X');
  });

  it('inserts among the children of a nested group', () => {
    const t = parseTrack('A G[B H[C D]]');
    expect(shape(insert(t, { parentId: 'H', index: 1 }, sq('X')))).toBe('A G[B H[C X D]]');
  });

  it('clamps an out-of-range index', () => {
    const t = parseTrack('A G[B C]');
    expect(shape(insert(t, { parentId: 'G', index: 99 }, sq('X')))).toBe('A G[B C X]');
    expect(shape(insert(t, { parentId: null, index: -3 }, sq('X')))).toBe('X A G[B C]');
  });

  it('returns the track unchanged when the parent does not exist', () => {
    const t = parseTrack('A B');
    expect(insert(t, { parentId: 'nope', index: 0 }, sq('X'))).toBe(t);
  });

  it('returns the track unchanged when the parent is a square', () => {
    const t = parseTrack('A B');
    expect(insert(t, { parentId: 'A', index: 0 }, sq('X'))).toBe(t);
  });

  it('returns the track unchanged when the id is already used', () => {
    const t = parseTrack('A G[B C]');
    expect(insert(t, { parentId: null, index: 0 }, sq('B'))).toBe(t);
  });

  it('keeps the inserted square as given', () => {
    const x = square('X', 'snare', true);
    expect(insert(parseTrack('A'), { parentId: null, index: 1 }, x).nodes[1]).toEqual(x);
  });
});

describe('remove', () => {
  it('removes squares at the root', () => {
    expect(shape(remove(parseTrack('A B C D'), ['B', 'D']))).toBe('A C');
  });

  it('removes a group with all its descendants', () => {
    const out = remove(parseTrack('A G[B H[C D]] E'), ['G']);
    expect(shape(out)).toBe('A E');
    expect(nodeIds(out)).toEqual(['A', 'E']);
  });

  it('removes a square deep inside nested groups', () => {
    expect(shape(remove(parseTrack('A G[B H[C D E]]'), ['D']))).toBe('A G[B H[C E]]');
  });

  it('leaves the other child in place when one child of a 2-child group is removed', () => {
    expect(shape(remove(parseTrack('A G[B C] D'), ['B']))).toBe('A C D');
  });

  it('removes a group when all its children are removed', () => {
    expect(shape(remove(parseTrack('A G[B C] D'), ['B', 'C']))).toBe('A D');
  });

  it('normalizes up the tree when a nested group disappears', () => {
    expect(shape(remove(parseTrack('A G[B H[C D]]'), ['C', 'D']))).toBe('A B');
  });

  it('can empty the track', () => {
    expect(remove(parseTrack('A G[B C]'), ['A', 'G']).nodes).toEqual([]);
  });

  it('ignores unknown and duplicate ids', () => {
    expect(shape(remove(parseTrack('A B C'), ['B', 'B', 'nope']))).toBe('A C');
  });

  it('returns the same track when no id matches', () => {
    const t = parseTrack('A B');
    expect(remove(t, ['nope'])).toBe(t);
    expect(remove(t, [])).toBe(t);
  });

  it('keeps the identity of untouched subtrees', () => {
    const t = parseTrack('A G[B C] D');
    const out = remove(t, ['D']);
    expect(out.nodes[1]).toBe(t.nodes[1]);
  });
});

describe('setSound', () => {
  const t = frozen([square('A', 'kick', true), group('G', [square('B', null), square('C', 'hat')]), sq('D')]);

  it('sets the sound of the targeted squares only, keeping muted', () => {
    expect(sounds(setSound(t, ['A', 'C'], 'snare'))).toEqual(['A:snare~', 'B:-', 'C:snare', 'D:kick']);
  });

  it('makes squares silent with null', () => {
    expect(sounds(setSound(t, ['D'], null))).toEqual(['A:kick~', 'B:-', 'C:hat', 'D:-']);
  });

  it('targets all descendant squares of a group id', () => {
    expect(sounds(setSound(t, ['G'], 'rim'))).toEqual(['A:kick~', 'B:rim', 'C:rim', 'D:kick']);
  });

  it('does not change the structure', () => {
    expect(shape(setSound(t, ['G', 'A'], 'rim'))).toBe(shape(t));
  });

  it('returns the same track when no square is targeted', () => {
    expect(setSound(t, ['nope'], 'rim')).toBe(t);
    expect(setSound(t, [], 'rim')).toBe(t);
  });

  it('keeps the identity of untouched subtrees', () => {
    expect(setSound(t, ['D'], 'rim').nodes[1]).toBe(t.nodes[1]);
  });
});

describe('toggleMute', () => {
  const t = frozen([square('A', 'kick', true), group('G', [square('B', 'hat', true), sq('C')]), sq('D')]);

  it('mutes all targeted squares when at least one is unmuted', () => {
    expect(sounds(toggleMute(t, ['A', 'D']))).toEqual(['A:kick~', 'B:hat~', 'C:kick', 'D:kick~']);
  });

  it('unmutes all targeted squares when all are muted', () => {
    expect(sounds(toggleMute(t, ['A', 'B']))).toEqual(['A:kick', 'B:hat', 'C:kick', 'D:kick']);
  });

  it('mutes a single unmuted square and unmutes it again', () => {
    const once = toggleMute(t, ['D']);
    expect(sounds(once)).toContain('D:kick~');
    expect(sounds(toggleMute(deepFreeze(once), ['D']))).toContain('D:kick');
  });

  it('targets all descendant squares of a group id', () => {
    expect(sounds(toggleMute(t, ['G']))).toEqual(['A:kick~', 'B:hat~', 'C:kick~', 'D:kick']);
  });

  it('counts a square once when both it and its group are selected', () => {
    const allMuted = frozen([group('G', [square('B', 'hat', true), square('C', 'hat', true)])]);
    expect(sounds(toggleMute(allMuted, ['G', 'B']))).toEqual(['B:hat', 'C:hat']);
  });

  it('returns the same track when no square is targeted', () => {
    expect(toggleMute(t, ['nope'])).toBe(t);
  });
});

describe('read helpers', () => {
  const t = parseTrack('A G[B H[C D]] E');

  it('findNode finds nodes at any depth', () => {
    expect(findNode(t, 'A')).toBe(t.nodes[0]);
    expect(findNode(t, 'H')?.kind).toBe('group');
    expect(findNode(t, 'D')).toEqual(sq('D'));
    expect(findNode(t, 'nope')).toBeUndefined();
  });

  it('findLocation returns the parent id and index', () => {
    expect(findLocation(t, 'A')).toEqual({ parentId: null, index: 0 });
    expect(findLocation(t, 'E')).toEqual({ parentId: null, index: 2 });
    expect(findLocation(t, 'H')).toEqual({ parentId: 'G', index: 1 });
    expect(findLocation(t, 'D')).toEqual({ parentId: 'H', index: 1 });
    expect(findLocation(t, 'nope')).toBeUndefined();
  });

  it('nodeIds lists all ids in document order, groups before their children', () => {
    expect(nodeIds(t)).toEqual(['A', 'G', 'B', 'H', 'C', 'D', 'E']);
  });
});

describe('invariants', () => {
  it('ops return normalized tracks with unique ids', () => {
    const t = parseTrack('A G[B H[C D]] E');
    const outs = [remove(t, ['C']), insert(t, { parentId: 'H', index: 0 }, sq('X')), toggleMute(t, ['G'])];
    for (const out of outs) {
      expect(normalize(out)).toBe(out);
      const ids = nodeIds(out);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('never mutates the input (inputs are deep-frozen)', () => {
    const t = parseTrack('A G[B H[C D]] E');
    const before = JSON.stringify(t);
    remove(t, ['C']);
    insert(t, { parentId: 'G', index: 1 }, sq('X'));
    setSound(t, ['G'], 'rim');
    toggleMute(t, ['A']);
    normalize(frozen([group('Z', [sq('Y')])]));
    expect(JSON.stringify(t)).toBe(before);
    expect(Object.isFrozen((findNode(t, 'H') as Group).children)).toBe(true);
  });
});
