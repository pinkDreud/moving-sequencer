import { describe, expect, it } from 'vitest';
import { createIdGen, createSong, group, square } from './model';

describe('createIdGen', () => {
  it('produces deterministic, unique ids with a prefix', () => {
    const next = createIdGen('n');
    expect([next(), next(), next()]).toEqual(['n1', 'n2', 'n3']);
  });
});

describe('constructors', () => {
  it('builds a square with a sound, unmuted by default', () => {
    expect(square('a', 'kick')).toEqual({ kind: 'square', id: 'a', soundId: 'kick', muted: false });
  });

  it('builds a silent square when the sound is null', () => {
    expect(square('a', null).soundId).toBeNull();
  });

  it('builds a group spanning one slot', () => {
    const g = group('g', [square('a', 'kick'), square('b', null)]);
    expect(g).toMatchObject({ kind: 'group', id: 'g', span: 1 });
    expect(g.children).toHaveLength(2);
  });

  it('creates a song with one empty track, 120 bpm, eighth-note slots', () => {
    const song = createSong(createIdGen('t'));
    expect(song).toEqual({ version: 1, bpm: 120, slotValue: 8, tracks: [{ id: 't1', nodes: [] }] });
  });
});
