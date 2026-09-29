import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { KIT } from './audio/sounds';
import { createIdGen, group, square, type Song, type Sound } from './core/model';
import { remove, setSound } from './core/ops';
import { AppState, defaultSong, watchSong } from './state.svelte';

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

  it('keeps the song object when bpm or slot value do not change', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    const before = state.song;
    state.setBpm(100);
    state.setBpm(100.2); // rounds to the current value
    state.setSlotValue(8);
    expect(state.song).toBe(before);
  });

  it('starts with the given sounds (kit plus restored recordings)', () => {
    const rec: Sound = { id: 'rec-a', name: 'Rec 1', color: '#fff', source: 'recording' };
    const state = new AppState({ song: song(), nextId: createIdGen('n'), sounds: [...KIT, rec] });
    expect(state.soundById('rec-a')).toBe(rec);
    expect(new AppState({ song: song(), nextId: createIdGen('n') }).sounds).toBe(KIT);
  });

  it('sets the tempo factor, keeping the song object when it does not change', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    const before = state.song;
    state.setTempoFactor(1);
    expect(state.song).toBe(before);
    state.setTempoFactor(2);
    expect(state.song.tempoFactor).toBe(2);
    expect(state.song.bpm).toBe(before.bpm);
  });

  it('sets swing clamped to [0, 0.75] and rounded to whole percent, ignoring NaN', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    const before = state.song;
    state.setSwing(0); // missing means 0: nothing changes
    expect(state.song).toBe(before);
    state.setSwing(0.333);
    expect(state.song.swing).toBe(0.33);
    expect(state.song.bpm).toBe(before.bpm);
    const same = state.song;
    state.setSwing(0.3304);
    expect(state.song).toBe(same);
    state.setSwing(2);
    expect(state.song.swing).toBe(0.75);
    state.setSwing(-1);
    expect(state.song.swing).toBe(0);
    const zero = state.song;
    state.setSwing(NaN);
    expect(state.song).toBe(zero);
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

  describe('sounds', () => {
    const rec: Sound = { id: 'rec-a', name: 'Rec 1', color: '#fff', source: 'recording' };

    it('addSound appends a sound after the kit', () => {
      const state = new AppState({ song: song(), nextId: createIdGen('n') });
      state.addSound(rec);
      expect(state.sounds.map((s) => s.id)).toEqual([...KIT.map((s) => s.id), 'rec-a']);
      expect(state.soundById('rec-a')).toBe(rec);
    });

    it('addSound ignores a sound whose id is already there', () => {
      const state = new AppState({ song: song(), nextId: createIdGen('n') });
      state.addSound(rec);
      const before = state.sounds;
      state.addSound({ ...rec, name: 'Other' });
      state.addSound({ id: 'kick', name: 'Fake kick', color: '#000', source: 'recording' });
      expect(state.sounds).toBe(before);
    });

    it('removeSound removes it and turns the squares that used it silent in every track', () => {
      const s: Song = {
        ...song(),
        tracks: [
          { id: 't', nodes: [square('a', 'rec-a'), group('g', [square('b', 'rec-a'), square('c', 'hat')])] },
          { id: 't2', nodes: [square('d', 'rec-a', true)] },
        ],
      };
      const state = new AppState({ song: s, nextId: createIdGen('n') });
      state.addSound(rec);
      state.select(['a']);
      state.removeSound('rec-a');
      expect(state.soundById('rec-a')).toBeUndefined();
      expect(state.track.nodes[0]).toEqual(square('a', null));
      expect(state.song.tracks[1]?.nodes[0]).toEqual(square('d', null));
      expect(state.track.nodes[1]).toMatchObject({ children: [square('b', null), square('c', 'hat')] });
      expect([...state.selection]).toEqual(['a']);
    });

    it('removeSound keeps the song object when no square used the sound', () => {
      const state = new AppState({ song: song(), nextId: createIdGen('n') });
      state.addSound(rec);
      const before = state.song;
      state.removeSound('rec-a');
      expect(state.song).toBe(before);
      expect(state.soundById('rec-a')).toBeUndefined();
    });

    it('removeSound of an unknown id changes nothing', () => {
      const state = new AppState({ song: song(), nextId: createIdGen('n') });
      const [songBefore, soundsBefore] = [state.song, state.sounds];
      state.removeSound('nope');
      expect(state.song).toBe(songBefore);
      expect(state.sounds).toBe(soundsBefore);
    });
  });
});

describe('watchSong', () => {
  it('reports the current song, then every new song object, until stopped', () => {
    const state = new AppState({ song: song(), nextId: createIdGen('n') });
    const seen: Song[] = [];
    const stop = watchSong(state, (s) => seen.push(s));
    flushSync();
    expect(seen).toEqual([state.song]);
    state.setBpm(140);
    flushSync();
    expect(seen).toHaveLength(2);
    expect(seen[1]).toBe(state.song);
    state.clearSelection();
    state.select(['a']);
    flushSync();
    expect(seen).toHaveLength(2); // selection is not part of the song
    stop();
    state.setBpm(150);
    flushSync();
    expect(seen).toHaveLength(2);
  });
});
