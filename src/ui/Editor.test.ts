import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { findNode } from '../core/ops';
import { shape } from '../core/test-helpers';
import Editor from './Editor.svelte';
import { makeApp } from './test-helpers';

const button = (name: string | RegExp) => screen.getByRole('button', { name });
const paletteButton = (name: string) => {
  const palette = screen.getByRole('group', { name: 'Sounds' });
  const found = [...palette.querySelectorAll('button')].find((b) => b.textContent?.trim() === name);
  if (!found) throw new Error(`no palette button ${name}`);
  return found;
};

describe('Editor', () => {
  it('shows the strip, the palette and, with a selection, the selection bar', () => {
    const app = makeApp('A B');
    render(Editor, { app });
    expect(screen.getByRole('region', { name: 'Pattern' })).toBeInTheDocument();
    expect(screen.getByRole('group', { name: 'Sounds' })).toBeInTheDocument();
    expect(screen.queryByRole('toolbar', { name: 'Selection' })).toBeNull();
    app.select(['A']);
    flushSync();
    expect(screen.getByRole('toolbar', { name: 'Selection' })).toBeInTheDocument();
  });

  it('a palette tap appends a square, which the strip shows', () => {
    const app = makeApp('A B');
    render(Editor, { app });
    fireEvent.click(paletteButton('Clap'));
    expect(shape(app.track)).toBe('A B n1');
    const strip = screen.getByRole('region', { name: 'Pattern' });
    expect(within(strip).getByRole('button', { name: 'Clap' })).toHaveAttribute('data-node-id', 'n1');
  });

  it('a palette tap with a selection inserts after it', () => {
    const app = makeApp('A B', ['A']);
    render(Editor, { app });
    fireEvent.click(paletteButton('Silent'));
    expect(shape(app.track)).toBe('A n1 B');
  });

  it('a palette tap with a selection sets the sound of the selected squares (no Sound button)', () => {
    const app = makeApp('A B C', ['A', 'C']);
    render(Editor, { app });
    expect(screen.queryByRole('button', { name: 'Sound', exact: true })).toBeNull();
    fireEvent.click(paletteButton('Rim'));
    expect(shape(app.track)).toBe('A B C');
    expect(findNode(app.track, 'A')).toMatchObject({ soundId: 'rim' });
    expect(findNode(app.track, 'C')).toMatchObject({ soundId: 'rim' });
    expect(findNode(app.track, 'B')).toMatchObject({ soundId: 'kick' });
  });

  it('keyboard: Delete, M, G, Shift+G and Escape act on the selection', () => {
    const app = makeApp('A B C D', ['A', 'B']);
    render(Editor, { app });
    fireEvent.keyDown(window, { key: 'm' });
    expect(findNode(app.track, 'A')).toMatchObject({ muted: true });
    fireEvent.keyDown(window, { key: 'g' });
    expect(shape(app.track)).toBe('n1[A B] C D');
    fireEvent.keyDown(window, { key: 'G', shiftKey: true });
    expect(shape(app.track)).toBe('A B C D');
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(shape(app.track)).toBe('C D');
    app.select(['C']);
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(shape(app.track)).toBe('D');
    app.select(['D']);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(app.selection.size).toBe(0);
  });

  it('keyboard shortcuts are ignored with Ctrl, Cmd or Alt held', () => {
    const app = makeApp('A B', ['A', 'B']);
    const song = app.song;
    render(Editor, { app });
    fireEvent.keyDown(window, { key: 'g', ctrlKey: true });
    fireEvent.keyDown(window, { key: 'm', metaKey: true });
    fireEvent.keyDown(window, { key: 'Delete', altKey: true });
    expect(app.song).toBe(song);
  });

  it('keyboard shortcuts are ignored while typing in a text field', () => {
    const app = makeApp('A B', ['A']);
    render(Editor, { app });
    const input = document.createElement('input');
    document.body.append(input);
    fireEvent.keyDown(input, { key: 'Backspace' });
    expect(shape(app.track)).toBe('A B');
  });
});
