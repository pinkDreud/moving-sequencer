import { describe, expect, it } from 'vitest';
import { KIT } from './audio/sounds';
import { createIdGen, square, type Song } from './core/model';
import { remove, setSound } from './core/ops';
import { AppState, defaultSong } from './state.svelte';

const song = (): Song => ({
  version: 1,
  bpm: 100,
  slotValue: 8,
  tracks: [{ id: 't', nodes: [square('a', 'kick'), square('b', 'hat'), square('c', null)] }],
});

describe('KIT', () => {
  it('lists 8 kit sounds with unique ids, names and colors', () => {
    expect(KIT.map((s) => s.id)).toEqual([
      'kick',
      'snare',
      'hat',
      'clap',
      'rim',
      'tone-low',
      'tone-mid',
      'tone-high',
    ]);
    expect(new Set(KIT.map((s) => s.color)).size).toBe(8);
    expect(KIT.every((s) => s.source === 'kit' && s.name.length > 0)).toBe(true);
  });
});

describe('defaultSong', () => {
  it('is an 8-slot beat made of kit sounds', () => {
    const s = defaultSong(createIdGen('n'));
    const nodes = s.tracks[0]?.nodes ?? [];
    expect(nodes).toHaveLength(8);
    const kitIds = new Set(KIT.map((k) => k.id));
    expect(nodes.every((n) => n.kind === 'square' && n.soundId !== null && kitIds.has(n.soundId))).toBe(true);
  });
});

describe('AppState', () => {
  it('exposes the first track', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    expect(state.track.id).toBe('t');
  });

  it('updateTrack replaces the first track and keeps the song when the op is a no-op', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    const before = state.song;
    state.updateTrack((t) => setSound(t, ['zzz'], 'kick'));
    expect(state.song).toBe(before);
    state.updateTrack((t) => setSound(t, ['c'], 'clap'));
    expect(state.song).not.toBe(before);
    expect(state.track.nodes[2]).toMatchObject({ id: 'c', soundId: 'clap' });
  });

  it('drops removed nodes from the selection', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    state.select(['a', 'b']);
    state.updateTrack((t) => remove(t, ['a']));
    expect([...state.selection]).toEqual(['b']);
  });

  it('select replaces, toggle flips membership, clearSelection empties', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    state.select(['a']);
    state.toggle('b');
    expect([...state.selection].sort()).toEqual(['a', 'b']);
    state.toggle('a');
    expect([...state.selection]).toEqual(['b']);
    state.clearSelection();
    expect(state.selection.size).toBe(0);
  });

  it('clamps and rounds bpm to 30..300', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    state.setBpm(500);
    expect(state.song.bpm).toBe(300);
    state.setBpm(10);
    expect(state.song.bpm).toBe(30);
    state.setBpm(121.6);
    expect(state.song.bpm).toBe(122);
    state.setBpm(Number.NaN);
    expect(state.song.bpm).toBe(122);
  });

  it('sets the slot value', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    state.setSlotValue(16);
    expect(state.song.slotValue).toBe(16);
  });

  it('finds sounds by id', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    expect(state.soundById('snare')?.name).toBe('Snare');
    expect(state.soundById('nope')).toBeUndefined();
  });
});
