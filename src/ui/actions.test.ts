import { describe, expect, it } from 'vitest';
import { findNode } from '../core/ops';
import { shape } from '../core/test-helpers';
import type { AppState } from '../state.svelte';
import {
  deleteSelection,
  groupSelection,
  pickSound,
  runShortcut,
  toggleMuteSelection,
  ungroupSelection,
} from './actions';
import { makeApp } from './test-helpers';

const selected = (app: AppState) => [...app.selection].sort();

describe('pickSound', () => {
  it('appends a square with the sound when nothing is selected, keeping the selection empty', () => {
    const app = makeApp('A B');
    pickSound(app, 'snare', false);
    expect(shape(app.track)).toBe('A B n1');
    expect(findNode(app.track, 'n1')).toMatchObject({ kind: 'square', soundId: 'snare', muted: false });
    expect(app.selection.size).toBe(0);
  });

  it('appends a silent square for "Silent"', () => {
    const app = makeApp('A');
    pickSound(app, null, false);
    expect(findNode(app.track, 'n1')).toMatchObject({ kind: 'square', soundId: null });
  });

  it('inserts after the last selected node and selects the new square, so taps build in order', () => {
    const app = makeApp('A B C', ['A']);
    pickSound(app, 'kick', false);
    pickSound(app, 'snare', false);
    expect(shape(app.track)).toBe('A n1 n2 B C');
    expect(selected(app)).toEqual(['n2']);
  });

  it('inserts inside a group when the last selected node is a child', () => {
    const app = makeApp('A G[B C] D', ['B']);
    pickSound(app, 'hat', false);
    expect(shape(app.track)).toBe('A G[B n1 C] D');
  });

  it('sets the sound of the selection instead when asked to apply it', () => {
    const app = makeApp('A G[B C] D', ['A', 'G']);
    pickSound(app, 'clap', true);
    expect(shape(app.track)).toBe('A G[B C] D');
    for (const id of ['A', 'B', 'C']) expect(findNode(app.track, id)).toMatchObject({ soundId: 'clap' });
    expect(findNode(app.track, 'D')).toMatchObject({ soundId: 'kick' });
    expect(selected(app)).toEqual(['A', 'G']);
  });

  it('inserts when asked to apply but nothing is selected', () => {
    const app = makeApp('A');
    pickSound(app, 'clap', true);
    expect(shape(app.track)).toBe('A n1');
  });
});

describe('selection actions', () => {
  it('deleteSelection removes the selected nodes and clears the selection', () => {
    const app = makeApp('A G[B C] D', ['A', 'G']);
    deleteSelection(app);
    expect(shape(app.track)).toBe('D');
    expect(app.selection.size).toBe(0);
  });

  it('toggleMuteSelection mutes, then unmutes', () => {
    const app = makeApp('A B', ['A']);
    toggleMuteSelection(app);
    expect(findNode(app.track, 'A')).toMatchObject({ muted: true });
    toggleMuteSelection(app);
    expect(findNode(app.track, 'A')).toMatchObject({ muted: false });
  });

  it('groupSelection groups siblings and selects the new group', () => {
    const app = makeApp('A B C D', ['B', 'D', 'A']);
    groupSelection(app);
    expect(shape(app.track)).toBe('n1[A B D] C');
    expect(selected(app)).toEqual(['n1']);
  });

  it('groupSelection does nothing when the selection cannot be grouped', () => {
    const app = makeApp('G[A B] H[C D]', ['A', 'C']);
    const song = app.song;
    groupSelection(app);
    expect(app.song).toBe(song);
    expect(selected(app)).toEqual(['A', 'C']);
  });

  it('groupSelection adds outside squares to the selected group and selects that group', () => {
    const app = makeApp('A G[B C] D', ['G', 'D']);
    groupSelection(app);
    expect(shape(app.track)).toBe('A G[B C D]');
    expect(selected(app)).toEqual(['G']);
  });

  it('ungroupSelection ungroups every selected group and selects their former children', () => {
    const app = makeApp('A G[B C] H[D E]', ['G', 'H', 'A']);
    ungroupSelection(app);
    expect(shape(app.track)).toBe('A B C D E');
    expect(selected(app)).toEqual(['B', 'C', 'D', 'E']);
  });

  it('ungroupSelection does nothing without a selected group', () => {
    const app = makeApp('A G[B C]', ['A']);
    const song = app.song;
    ungroupSelection(app);
    expect(app.song).toBe(song);
    expect(selected(app)).toEqual(['A']);
  });
});

describe('runShortcut', () => {
  it('dispatches each shortcut to its action', () => {
    const app = makeApp('A B C', ['A', 'B']);
    runShortcut(app, 'mute');
    expect(findNode(app.track, 'A')).toMatchObject({ muted: true });
    runShortcut(app, 'group');
    expect(shape(app.track)).toBe('n1[A B] C');
    runShortcut(app, 'ungroup');
    expect(shape(app.track)).toBe('A B C');
    runShortcut(app, 'delete');
    expect(shape(app.track)).toBe('C');
    app.select(['C']);
    runShortcut(app, 'clear');
    expect(app.selection.size).toBe(0);
  });
});
