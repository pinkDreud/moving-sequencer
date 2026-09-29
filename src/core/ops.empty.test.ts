import { describe, expect, it } from 'vitest';
import { square } from './model';
import { emptySquares, findNode } from './ops';
import { deepFreeze, parseTrack, shape } from './test-helpers';

describe('emptySquares', () => {
  it('makes the targeted squares silent and unmuted, keeping the pattern length', () => {
    const t = deepFreeze({
      id: 't',
      nodes: [square('A', 'kick', true), square('B', 'hat'), square('C', 'clap')],
    });
    const out = emptySquares(t, ['A', 'C']);
    expect(shape(out)).toBe('A B C');
    expect(findNode(out, 'A')).toMatchObject({ soundId: null, muted: false });
    expect(findNode(out, 'B')).toMatchObject({ soundId: 'hat' });
    expect(findNode(out, 'C')).toMatchObject({ soundId: null });
  });

  it('a group id empties every square in the group', () => {
    const out = emptySquares(parseTrack('A G[B C] D'), ['G']);
    for (const id of ['B', 'C']) expect(findNode(out, id)).toMatchObject({ soundId: null });
    expect(findNode(out, 'A')).toMatchObject({ soundId: 'kick' });
  });

  it('returns the same track when everything targeted is already empty', () => {
    const t = deepFreeze({ id: 't', nodes: [square('A', null), square('B', 'hat')] });
    expect(emptySquares(t, ['A'])).toBe(t);
  });
});
