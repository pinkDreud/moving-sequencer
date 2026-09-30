import { describe, expect, it } from 'vitest';
import { createIdGen, square, type Song } from './core/model';
import { remove, setSound } from './core/ops';
import { AppState, MAX_TRACKS } from './state.svelte';

const song = (): Song => ({
  version: 1,
  bpm: 100,
  slotValue: 8,
  tracks: [
    { id: 't1', nodes: [square('a', 'kick'), square('b', 'hat')] },
    { id: 't2', nodes: [square('c', 'snare')], sync: 'loop' },
    { id: 't3', nodes: [] },
  ],
});

const make = () => new AppState({ song: song(), nextId: createIdGen('n') });
const ids = (app: AppState) => app.song.tracks.map((t) => t.id);

describe('AppState active track', () => {
  it('starts on the master', () => {
    const app = make();
    expect(app.activeTrack).toBe(0);
    expect(app.track.id).toBe('t1');
  });

  it('selectTrack makes another track the one shown and edited', () => {
    const app = make();
    app.selectTrack(1);
    expect(app.activeTrack).toBe(1);
    expect(app.track.id).toBe('t2');
    expect(app.trackOf('pattern').id).toBe('t2');
  });

  it('selectTrack clears the selection and the range anchor, and ignores an index that is not a track', () => {
    const app = make();
    app.select(['a']);
    app.anchor = 'a';
    app.selectTrack(1);
    expect(app.selection.size).toBe(0);
    expect(app.anchor).toBeNull();
    app.selectTrack(7);
    app.selectTrack(-1);
    app.selectTrack(0.5);
    expect(app.activeTrack).toBe(1);
  });

  it('selecting the track already shown keeps the selection', () => {
    const app = make();
    app.select(['a']);
    app.selectTrack(0);
    expect([...app.selection]).toEqual(['a']);
  });

  it('updateTrack edits the active track and leaves the others untouched', () => {
    const app = make();
    const [master, , third] = app.song.tracks;
    app.selectTrack(1);
    app.updateTrack((t) => setSound(t, ['c'], 'clap'));
    expect(app.song.tracks[0]).toBe(master);
    expect(app.song.tracks[2]).toBe(third);
    expect(app.song.tracks[1]).toMatchObject({ id: 't2', sync: 'loop', nodes: [square('c', 'clap')] });
  });

  it('drops removed nodes of the active track from the selection', () => {
    const app = make();
    app.selectTrack(1);
    app.select(['c']);
    app.updateTrack((t) => remove(t, ['c']));
    expect(app.selection.size).toBe(0);
  });
});

describe('AppState.addTrack', () => {
  it('appends an empty slot-synced track and shows it', () => {
    const app = make();
    app.select(['a']);
    app.addTrack();
    expect(ids(app)).toEqual(['t1', 't2', 't3', 'n1']);
    expect(app.song.tracks[3]).toEqual({ id: 'n1', nodes: [] });
    expect(app.activeTrack).toBe(3);
    expect(app.selection.size).toBe(0);
  });

  it(`stops at ${MAX_TRACKS} tracks`, () => {
    const app = make();
    for (let i = 0; i < 20; i++) app.addTrack();
    expect(app.song.tracks).toHaveLength(MAX_TRACKS);
    const before = app.song;
    app.addTrack();
    expect(app.song).toBe(before);
    expect(app.activeTrack).toBe(MAX_TRACKS - 1);
  });
});

describe('AppState.removeTrack', () => {
  it('removes a track and keeps showing the same track when it is another one', () => {
    const app = make();
    app.selectTrack(2);
    app.removeTrack(1);
    expect(ids(app)).toEqual(['t1', 't3']);
    expect(app.track.id).toBe('t3');
  });

  it('removing the track shown shows the one now at its place, or the last one', () => {
    const app = make();
    app.selectTrack(1);
    app.select(['c']);
    app.removeTrack(1);
    expect(app.track.id).toBe('t3');
    expect(app.selection.size).toBe(0);
    app.removeTrack(1);
    expect(ids(app)).toEqual(['t1']);
    expect(app.track.id).toBe('t1');
  });

  it('never removes the master or a track that does not exist', () => {
    const app = make();
    const before = app.song;
    app.removeTrack(0);
    app.removeTrack(3);
    app.removeTrack(-1);
    expect(app.song).toBe(before);
  });
});

describe('AppState.setTrackSync', () => {
  it('sets what a track shares with the master', () => {
    const app = make();
    app.setTrackSync(2, 'loop');
    expect(app.song.tracks[2]).toEqual({ id: 't3', nodes: [], sync: 'loop' });
    app.setTrackSync(1, 'slot');
    expect(app.song.tracks[1]?.sync).toBe('slot');
  });

  it('keeps the song object when nothing changes (a missing sync is slot)', () => {
    const app = make();
    const before = app.song;
    app.setTrackSync(1, 'loop');
    app.setTrackSync(2, 'slot');
    expect(app.song).toBe(before);
  });

  it('ignores the master and tracks that do not exist', () => {
    const app = make();
    const before = app.song;
    app.setTrackSync(0, 'loop');
    app.setTrackSync(9, 'loop');
    expect(app.song).toBe(before);
  });
});
