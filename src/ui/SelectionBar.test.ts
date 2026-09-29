import { fireEvent, render, screen } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { findNode } from '../core/ops';
import { shape } from '../core/test-helpers';
import SelectionBar from './SelectionBar.svelte';
import { makeApp } from './test-helpers';

const bar = () => screen.queryByRole('toolbar', { name: 'Selection' });
const button = (name: string | RegExp) => screen.getByRole('button', { name });

describe('SelectionBar', () => {
  it('is hidden when nothing is selected and appears with a selection', () => {
    const app = makeApp('A B');
    render(SelectionBar, { app });
    expect(bar()).toBeNull();
    app.select(['A']);
    flushSync();
    expect(bar()).toBeInTheDocument();
    expect(bar()).toHaveTextContent('1 selected');
  });

  it('Mute mutes the selection and then reads Unmute', () => {
    const app = makeApp('A B', ['A']);
    render(SelectionBar, { app });
    fireEvent.click(button('Mute'));
    expect(findNode(app.track, 'A')).toMatchObject({ muted: true });
    fireEvent.click(button('Unmute'));
    expect(findNode(app.track, 'A')).toMatchObject({ muted: false });
    expect(button('Mute')).toBeInTheDocument();
  });

  it('Group is enabled only when the selection can be grouped, and groups it', () => {
    const app = makeApp('A B C', ['A']);
    render(SelectionBar, { app });
    expect(button('Group')).toBeDisabled();
    app.select(['A', 'B']);
    flushSync();
    expect(button('Group')).toBeEnabled();
    fireEvent.click(button('Group'));
    expect(shape(app.track)).toBe('n1[A B] C');
    expect([...app.selection]).toEqual(['n1']);
  });

  it('Ungroup is enabled only when a group is selected, and ungroups it', () => {
    const app = makeApp('A G[B C]', ['A']);
    render(SelectionBar, { app });
    expect(button('Ungroup')).toBeDisabled();
    app.select(['G']);
    flushSync();
    fireEvent.click(button('Ungroup'));
    expect(shape(app.track)).toBe('A B C');
    expect([...app.selection].sort()).toEqual(['B', 'C']);
  });

  it('Delete removes the selection', () => {
    const app = makeApp('A B C', ['A', 'C']);
    render(SelectionBar, { app });
    fireEvent.click(button('Delete'));
    expect(shape(app.track)).toBe('B');
    expect(bar()).toBeNull();
  });

  it('Clear empties the selection without editing', () => {
    const app = makeApp('A B', ['A']);
    const song = app.song;
    render(SelectionBar, { app });
    fireEvent.click(button('Clear selection'));
    expect(app.selection.size).toBe(0);
    expect(app.song).toBe(song);
  });

  it('has no Sound button: a palette tap sets the sound of the selection directly', () => {
    render(SelectionBar, { app: makeApp('A B', ['A']) });
    expect(screen.queryByRole('button', { name: 'Sound', exact: true })).toBeNull();
  });
});
