import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { shape } from '../core/test-helpers';
import { MAX_TRACKS } from '../state.svelte';
import Editor from './Editor.svelte';
import { makeApp } from './test-helpers';
import TrackTabs from './TrackTabs.svelte';

const tabs = () => within(screen.getByRole('tablist', { name: 'Tracks' })).getAllByRole('tab');
const tab = (name: string) => screen.getByRole('tab', { name });
const button = (name: string) => screen.getByRole('button', { name });
const radio = (name: string) => screen.getByRole('radio', { name });

/** A master `A B` plus one empty track per extra spec. */
function setup(...others: string[]) {
  const app = makeApp('A B');
  for (const spec of others) {
    app.addTrack();
    if (spec) app.updateTrack((t) => ({ ...t, nodes: spec.split(' ').map((id) => ({ ...sq, id })) }));
  }
  app.selectTrack(0);
  return app;
}
const sq = { kind: 'square', soundId: 'hat', muted: false } as const;

describe('TrackTabs', () => {
  it('shows one tab per track, the master first and selected', () => {
    render(TrackTabs, { app: setup('', '') });
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['Master', 'Track 2', 'Track 3']);
    expect(tab('Master')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Track 2')).toHaveAttribute('aria-selected', 'false');
  });

  it('selects a track when its tab is pressed', async () => {
    const app = setup('');
    render(TrackTabs, { app });
    await fireEvent.click(tab('Track 2'));
    expect(app.activeTrack).toBe(1);
    expect(tab('Track 2')).toHaveAttribute('aria-selected', 'true');
    expect(tab('Master')).toHaveAttribute('aria-selected', 'false');
  });

  it('Add track adds a track and shows it', async () => {
    const app = setup();
    render(TrackTabs, { app });
    await fireEvent.click(button('Add track'));
    expect(app.song.tracks).toHaveLength(2);
    expect(tab('Track 2')).toHaveAttribute('aria-selected', 'true');
  });

  it(`disables Add track at ${MAX_TRACKS} tracks`, () => {
    const app = setup();
    while (app.song.tracks.length < MAX_TRACKS) app.addTrack();
    render(TrackTabs, { app });
    expect(button('Add track')).toBeDisabled();
  });

  it('offers no sync and no remove on the master', () => {
    render(TrackTabs, { app: setup('') });
    expect(screen.queryByRole('radiogroup', { name: 'Sync' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remove track' })).toBeNull();
  });

  it('shows what the active track shares with the master and changes it', async () => {
    const app = setup('');
    app.selectTrack(1);
    render(TrackTabs, { app });
    expect(screen.getByRole('radiogroup', { name: 'Sync' })).toBeInTheDocument();
    expect(radio('Same slots')).toBeChecked();
    await fireEvent.click(radio('Same loop'));
    expect(app.song.tracks[1]?.sync).toBe('loop');
    expect(radio('Same loop')).toBeChecked();
    await fireEvent.click(radio('Same slots'));
    expect(app.song.tracks[1]?.sync).toBe('slot');
  });

  it('removes the active track only on the second press', async () => {
    const app = setup('', '');
    app.selectTrack(1);
    render(TrackTabs, { app });
    await fireEvent.click(button('Remove track'));
    expect(app.song.tracks).toHaveLength(3);
    await fireEvent.click(button('Remove?'));
    expect(app.song.tracks).toHaveLength(2);
    // The next track took its place and needs its own two presses.
    expect(button('Remove track')).toBeInTheDocument();
  });

  it('forgets the first press when another tab is selected', async () => {
    const app = setup('', '');
    app.selectTrack(1);
    render(TrackTabs, { app });
    await fireEvent.click(button('Remove track'));
    await fireEvent.click(tab('Track 3'));
    expect(screen.queryByRole('button', { name: 'Remove?' })).toBeNull();
    expect(button('Remove track')).toBeInTheDocument();
    expect(app.song.tracks).toHaveLength(3);
  });
});

describe('Editor with several tracks', () => {
  const strip = () => screen.getByRole('region', { name: 'Pattern' });
  const shown = () =>
    [...strip().querySelectorAll(':scope > [data-node-id]')].map((el) => el.getAttribute('data-node-id'));

  it('shows the track of the selected tab in the pattern strip', async () => {
    const app = setup('X Y Z');
    render(Editor, { app });
    expect(shown()).toEqual(['A', 'B']);
    await fireEvent.click(tab('Track 2'));
    expect(shown()).toEqual(['X', 'Y', 'Z']);
  });

  it('palette taps and selection actions edit the track shown only', async () => {
    const app = setup('X Y');
    render(Editor, { app });
    await fireEvent.click(tab('Track 2'));
    const palette = screen.getByRole('group', { name: 'Sounds' });
    const clap = [...palette.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Clap');
    if (!clap) throw new Error('no Clap button');
    await fireEvent.click(clap);
    expect(shown()).toHaveLength(3);
    app.select(['X']);
    flushSync();
    await fireEvent.click(button('Remove'));
    expect(shown()).toHaveLength(2);
    expect(shape(app.song.tracks[0] ?? { id: '', nodes: [] })).toBe('A B');
  });

  it('switching tab clears the selection', async () => {
    const app = setup('X');
    render(Editor, { app });
    app.select(['A']);
    flushSync();
    await fireEvent.click(tab('Track 2'));
    expect(app.selection.size).toBe(0);
    expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull();
  });
});
