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
    pickSound(app, 'snare');
    expect(shape(app.track)).toBe('A B n1');
    expect(findNode(app.track, 'n1')).toMatchObject({ kind: 'square', soundId: 'snare', muted: false });
    expect(app.selection.size).toBe(0);
  });

  it('appends a silent square for "Silent"', () => {
    const app = makeApp('A');
    pickSound(app, null);
    expect(findNode(app.track, 'n1')).toMatchObject({ kind: 'square', soundId: null });
  });

  it('issue #1: with a square selected, the tapped sound goes into that square, not the next one', () => {
    const app = makeApp('A B C', ['B']);
    pickSound(app, 'clap');
    expect(shape(app.track)).toBe('A B C');
    expect(findNode(app.track, 'B')).toMatchObject({ soundId: 'clap' });
    expect(findNode(app.track, 'C')).toMatchObject({ soundId: 'kick' });
    expect(selected(app)).toEqual(['B']);
  });

  it('sets the sound of every selected square, and of all squares in a selected group', () => {
    const app = makeApp('A G[B C] D', ['A', 'G']);
    pickSound(app, 'clap');
    expect(shape(app.track)).toBe('A G[B C] D');
    for (const id of ['A', 'B', 'C']) expect(findNode(app.track, id)).toMatchObject({ soundId: 'clap' });
    expect(findNode(app.track, 'D')).toMatchObject({ soundId: 'kick' });
  });

  it('a square inside a group changes only that square (no insertion into the group)', () => {
    const app = makeApp('A G[B C] D', ['B']);
    pickSound(app, 'hat');
    expect(shape(app.track)).toBe('A G[B C] D');
    expect(findNode(app.track, 'B')).toMatchObject({ soundId: 'hat' });
  });

  it('"Silent" with a selection makes the selected squares silent', () => {
    const app = makeApp('A B', ['A']);
    pickSound(app, null);
    expect(findNode(app.track, 'A')).toMatchObject({ soundId: null });
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

describe('actions in the preparation area', () => {
  it('pickSound with nothing selected appends to the active area', () => {
    const app = makeApp('A B', [], 'P');
    app.activeArea = 'prep';
    pickSound(app, 'rim');
    expect(shape(app.prep)).toBe('P n1');
    expect(findNode(app.prep, 'n1')).toMatchObject({ soundId: 'rim' });
    expect(shape(app.track)).toBe('A B');
    app.activeArea = 'pattern';
    pickSound(app, 'hat');
    expect(shape(app.track)).toBe('A B n2');
  });

  it('pickSound with a selection sets the sound in both areas, whatever the active area', () => {
    const app = makeApp('A B', ['A', 'P'], 'P Q');
    pickSound(app, 'clap');
    expect(findNode(app.track, 'A')).toMatchObject({ soundId: 'clap' });
    expect(findNode(app.prep, 'P')).toMatchObject({ soundId: 'clap' });
    expect(findNode(app.prep, 'Q')).toMatchObject({ soundId: 'kick' });
    expect(shape(app.prep)).toBe('P Q');
  });

  it('deleteSelection removes selected nodes from both areas', () => {
    const app = makeApp('A B', ['A', 'Q'], 'P Q');
    deleteSelection(app);
    expect(shape(app.track)).toBe('B');
    expect(shape(app.prep)).toBe('P');
    expect(app.selection.size).toBe(0);
  });

  it('toggleMuteSelection treats both areas as one selection', () => {
    const app = makeApp('A B', ['A', 'P'], 'P Q');
    toggleMuteSelection(app);
    expect(findNode(app.track, 'A')).toMatchObject({ muted: true });
    expect(findNode(app.prep, 'P')).toMatchObject({ muted: true });
    toggleMuteSelection(app);
    expect(findNode(app.track, 'A')).toMatchObject({ muted: false });
    expect(findNode(app.prep, 'P')).toMatchObject({ muted: false });
  });

  it('groupSelection groups inside the prep area', () => {
    const app = makeApp('A B', ['P', 'Q'], 'P Q R');
    groupSelection(app);
    expect(shape(app.prep)).toBe('n1[P Q] R');
    expect(shape(app.track)).toBe('A B');
    expect(selected(app)).toEqual(['n1']);
  });

  it('groupSelection does nothing for a selection that spans both areas', () => {
    const app = makeApp('A B', ['A', 'B', 'P'], 'P Q');
    const [song, prep] = [app.song, app.prep];
    groupSelection(app);
    expect(app.song).toBe(song);
    expect(app.prep).toBe(prep);
  });

  it('ungroupSelection ungroups selected groups in either area', () => {
    const app = makeApp('A G[B C]', ['G', 'H'], 'H[P Q] R');
    ungroupSelection(app);
    expect(shape(app.track)).toBe('A B C');
    expect(shape(app.prep)).toBe('P Q R');
    expect(selected(app)).toEqual(['B', 'C', 'P', 'Q']);
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
