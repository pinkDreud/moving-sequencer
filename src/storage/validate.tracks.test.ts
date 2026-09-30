// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { square, type Song } from '../core/model';
import { parseSong } from './validate';

const withSecond = (extra: Record<string, unknown>): unknown => ({
  version: 1,
  bpm: 110,
  slotValue: 8,
  tracks: [
    { id: 't1', nodes: [square('a', 'kick')] },
    { id: 't2', nodes: [square('b', 'hat')], ...extra },
  ],
});

describe('parseSong track sync', () => {
  it('accepts slot and loop on any track', () => {
    for (const sync of ['slot', 'loop']) expect(parseSong(withSecond({ sync }))?.tracks[1]?.sync).toBe(sync);
  });

  it('leaves a missing sync missing (older saves: it means slot)', () => {
    const song = parseSong(withSecond({})) as Song;
    expect(song.tracks).toHaveLength(2);
    expect(song.tracks[1]).toEqual({ id: 't2', nodes: [square('b', 'hat')] });
    expect(song.tracks[1]).not.toHaveProperty('sync');
  });

  it('rejects any other sync', () => {
    for (const sync of ['beat', '', 1, null, true]) expect(parseSong(withSecond({ sync }))).toBeNull();
  });
});
