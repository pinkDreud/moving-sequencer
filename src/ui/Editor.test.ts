import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { findNode } from '../core/ops';
import { shape } from '../core/test-helpers';
import Editor from './Editor.svelte';
import { makeApp } from './test-helpers';

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

  it('a palette tap with nothing selected appends a square at the end', () => {
    const app = makeApp('A B');
    render(Editor, { app });
    fireEvent.click(paletteButton('Silent'));
    expect(shape(app.track)).toBe('A B n1');
  });

  it('a palette tap with a selection sets the sound of the selected squares (no Sound button)', () => {
    const app = makeApp('A B C', ['A', 'C']);
    render(Editor, { app });
    expect(screen.queryByRole('button', { name: 'Sound' })).toBeNull();
    fireEvent.click(paletteButton('Rim'));
    expect(shape(app.track)).toBe('A B C');
    expect(findNode(app.track, 'A')).toMatchObject({ soundId: 'rim' });
    expect(findNode(app.track, 'C')).toMatchObject({ soundId: 'rim' });
    expect(findNode(app.track, 'B')).toMatchObject({ soundId: 'kick' });
  });

  it('keyboard: M, G, Shift+G, Delete, Shift+Delete and Escape act on the selection', () => {
    const app = makeApp('A B C D', ['A', 'B']);
    render(Editor, { app });
    fireEvent.keyDown(window, { key: 'm' });
    expect(findNode(app.track, 'A')).toMatchObject({ muted: true });
    fireEvent.keyDown(window, { key: 'g' });
    expect(shape(app.track)).toBe('n1[A B] C D');
    fireEvent.keyDown(window, { key: 'G', shiftKey: true });
    expect(shape(app.track)).toBe('A B C D');
    // Delete empties: same length, silent squares, selection kept.
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(shape(app.track)).toBe('A B C D');
    expect(findNode(app.track, 'A')).toMatchObject({ soundId: null, muted: false });
    expect(findNode(app.track, 'B')).toMatchObject({ soundId: null });
    expect([...app.selection].sort()).toEqual(['A', 'B']);
    // Shift+Delete removes.
    fireEvent.keyDown(window, { key: 'Delete', shiftKey: true });
    expect(shape(app.track)).toBe('C D');
    app.select(['D']);
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(app.selection.size).toBe(0);
  });

  it('Ins inserts an empty slot before the selection (or at the end without one)', () => {
    const app = makeApp('A B C', ['B']);
    render(Editor, { app });
    fireEvent.keyDown(window, { key: 'Insert' });
    expect(shape(app.track)).toBe('A n1 B C');
    expect(findNode(app.track, 'n1')).toMatchObject({ soundId: null });
    expect([...app.selection]).toEqual(['B']);
    app.clearSelection();
    fireEvent.keyDown(window, { key: 'i' });
    expect(shape(app.track)).toBe('A n1 B C n2');
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

  it('shows an empty, labelled preparation area with a hint', () => {
    render(Editor, { app: makeApp('A B') });
    const prep = screen.getByRole('region', { name: 'Prepare' });
    expect(prep.querySelectorAll('[data-node-id]')).toHaveLength(0);
    expect(prep).toHaveTextContent(/drag it into the pattern/i);
    expect(screen.getByRole('heading', { name: 'Prepare' })).toBeInTheDocument();
  });

  it('a tap in the prep area makes it the active area: palette taps then append there', () => {
    const app = makeApp('A B');
    render(Editor, { app });
    const pattern = screen.getByRole('region', { name: 'Pattern' });
    const prep = screen.getByRole('region', { name: 'Prepare' });
    expect(pattern).toHaveClass('active');
    expect(prep).not.toHaveClass('active');
    fireEvent.click(prep);
    expect(prep).toHaveClass('active');
    expect(pattern).not.toHaveClass('active');
    fireEvent.click(paletteButton('Clap'));
    fireEvent.click(paletteButton('Rim'));
    expect(shape(app.prep)).toBe('n1 n2');
    expect(shape(app.track)).toBe('A B');
    expect(within(prep).getByRole('button', { name: 'Clap' })).toHaveAttribute('data-node-id', 'n1');
    expect(prep).not.toHaveTextContent(/drag it into the pattern/i);
    fireEvent.click(pattern);
    expect(pattern).toHaveClass('active');
    fireEvent.click(paletteButton('Hat'));
    expect(shape(app.track)).toBe('A B n3');
  });

  it('a click on a prep square selects it, and a palette tap sets its sound', () => {
    const app = makeApp('A B', [], 'P Q');
    render(Editor, { app });
    const prep = screen.getByRole('region', { name: 'Prepare' });
    const p = prep.querySelector('[data-node-id="P"]');
    if (!(p instanceof HTMLElement)) throw new Error('no P');
    fireEvent.click(p);
    expect([...app.selection]).toEqual(['P']);
    fireEvent.click(paletteButton('Hat'));
    expect(findNode(app.prep, 'P')).toMatchObject({ soundId: 'hat' });
    expect(shape(app.prep)).toBe('P Q');
  });

  it('keyboard shortcuts act on a prep selection', () => {
    const app = makeApp('A', ['P', 'Q'], 'P Q R');
    render(Editor, { app });
    fireEvent.keyDown(window, { key: 'g' });
    expect(shape(app.prep)).toBe('n1[P Q] R');
    fireEvent.keyDown(window, { key: 'Delete' });
    expect(shape(app.prep)).toBe('R');
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
