import { fireEvent, render, screen, within } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import { describe, expect, it } from 'vitest';
import { group, square } from '../core/model';
import Strip from './Strip.svelte';
import { makeApp } from './test-helpers';

const nodes = () => [
  square('a', 'kick'),
  square('b', null),
  square('c', 'hat', true),
  group('g', [
    square('d', 'snare'),
    group('h', [square('e', 'clap'), square('f', null, true)]),
    square('i', 'rim'),
  ]),
];

function renderStrip(selection: string[] = []) {
  const app = makeApp(nodes(), selection);
  render(Strip, { app });
  const strip = screen.getByRole('region', { name: 'Pattern' });
  const byId = (id: string) => {
    const el = strip.querySelector(`[data-node-id="${id}"]`);
    if (!(el instanceof HTMLElement)) throw new Error(`no node ${id}`);
    return el;
  };
  return { app, strip, byId };
}

const selected = (app: { selection: ReadonlySet<string> }) => [...app.selection].sort();

describe('Strip rendering', () => {
  it('renders one slot per top-level node, in order', () => {
    const { strip } = renderStrip();
    const slots = [...strip.querySelectorAll(':scope > [data-node-id]')].map((el) =>
      el.getAttribute('data-node-id'),
    );
    expect(slots).toEqual(['a', 'b', 'c', 'g']);
  });

  it('labels squares with the sound name, "silent", and ", muted"', () => {
    renderStrip();
    expect(screen.getByRole('button', { name: 'Kick' })).toHaveAttribute('data-node-id', 'a');
    expect(screen.getByRole('button', { name: 'silent' })).toHaveAttribute('data-node-id', 'b');
    expect(screen.getByRole('button', { name: 'Hat, muted' })).toHaveAttribute('data-node-id', 'c');
    expect(screen.getByRole('button', { name: 'silent, muted' })).toHaveAttribute('data-node-id', 'f');
  });

  it('fills a square with its sound color and marks silent and muted squares', () => {
    const { byId } = renderStrip();
    expect(byId('a').style.getPropertyValue('--color')).toBe('#ff5d5d');
    expect(byId('b')).toHaveClass('silent');
    expect(byId('a')).not.toHaveClass('silent');
    expect(byId('c')).toHaveClass('muted');
    expect(byId('c').style.getPropertyValue('--color')).toBe('#5ee07a');
  });

  it('renders a group as one slot with its children inside, nested recursively', () => {
    const { byId } = renderStrip();
    const g = byId('g');
    expect(g).toHaveClass('group');
    const children = g.querySelector(':scope > .children');
    expect([...(children?.children ?? [])].map((el) => el.getAttribute('data-node-id'))).toEqual([
      'd',
      'h',
      'i',
    ]);
    const h = byId('h');
    expect(g.contains(h)).toBe(true);
    expect(within(h).getByRole('button', { name: 'Clap' })).toBeInTheDocument();
  });

  it('gives each group a frame button named after its size', () => {
    renderStrip();
    expect(screen.getByRole('button', { name: 'Group of 3' }).closest('[data-node-id]')).toHaveAttribute(
      'data-node-id',
      'g',
    );
    expect(screen.getByRole('button', { name: 'Group of 2' }).closest('[data-node-id]')).toHaveAttribute(
      'data-node-id',
      'h',
    );
  });

  it('renders a square whose sound is missing as silent, and shows the sound once it exists', () => {
    const app = makeApp([square('x', 'rec-1'), square('y', 'rec-1', true)]);
    render(Strip, { app });
    const x = screen.getByRole('button', { name: 'silent' });
    expect(x).toHaveClass('silent');
    expect(screen.getByRole('button', { name: 'silent, muted' })).toHaveClass('silent');
    expect(app.track.nodes[0]).toMatchObject({ soundId: 'rec-1' }); // the sound id is kept
    app.addSound({ id: 'rec-1', name: 'Rec 1', color: '#abc', source: 'recording' });
    flushSync();
    expect(x).toHaveAccessibleName('Rec 1');
    expect(x).not.toHaveClass('silent');
  });

  it('marks the leaf under the playhead as playing, and follows it', () => {
    const { app, byId } = renderStrip();
    expect(byId('a')).not.toHaveClass('playing');
    app.playheadId = 'e';
    flushSync();
    expect(byId('e')).toHaveClass('playing');
    app.playheadId = null;
    flushSync();
    expect(byId('e')).not.toHaveClass('playing');
  });
});

describe('Strip as the prep area', () => {
  it('never marks a prep node as playing (a node just moved there from the pattern)', () => {
    const app = makeApp('A', [], 'P');
    render(Strip, { app, area: 'prep' });
    app.playheadId = 'P';
    flushSync();
    const prep = screen.getByRole('region', { name: 'Prepare' });
    expect(prep.querySelector('[data-node-id="P"]')).not.toHaveClass('playing');
  });

  it('while empty it is focusable, and Enter or Space on it makes it the active area', () => {
    const app = makeApp('A');
    render(Strip, { app, area: 'prep' });
    const prep = screen.getByRole('region', { name: 'Prepare' });
    expect(prep).toHaveAttribute('tabindex', '0');
    expect(prep).not.toHaveAttribute('aria-current');
    fireEvent.keyDown(prep, { key: 'Enter' });
    expect(app.activeArea).toBe('prep');
    expect(prep).toHaveAttribute('aria-current', 'true');
    app.activeArea = 'pattern';
    fireEvent.keyDown(prep, { key: ' ' });
    expect(app.activeArea).toBe('prep');
  });

  it('is not an extra tab stop once it has squares (they are buttons)', () => {
    render(Strip, { app: makeApp('A', [], 'P'), area: 'prep' });
    expect(screen.getByRole('region', { name: 'Prepare' })).not.toHaveAttribute('tabindex');
  });
});

describe('Strip selection', () => {
  it('a mouse click selects only this node', () => {
    const { app, byId } = renderStrip(['b', 'c']);
    fireEvent.pointerDown(byId('a'), { pointerType: 'mouse' });
    fireEvent.click(byId('a'));
    expect(selected(app)).toEqual(['a']);
    expect(byId('a')).toHaveAttribute('aria-pressed', 'true');
    expect(byId('b')).toHaveAttribute('aria-pressed', 'false');
    expect(byId('a')).toHaveClass('selected');
  });

  it('shift, cmd or ctrl click toggles the node', () => {
    const { app, byId } = renderStrip(['a']);
    fireEvent.click(byId('b'), { shiftKey: true });
    expect(selected(app)).toEqual(['a', 'b']);
    fireEvent.click(byId('c'), { metaKey: true });
    expect(selected(app)).toEqual(['a', 'b', 'c']);
    fireEvent.click(byId('a'), { ctrlKey: true });
    expect(selected(app)).toEqual(['b', 'c']);
  });

  it('a touch tap toggles the node', () => {
    const { app, byId } = renderStrip(['a']);
    fireEvent.pointerDown(byId('b'), { pointerType: 'touch' });
    fireEvent.click(byId('b'), { detail: 1 });
    expect(selected(app)).toEqual(['a', 'b']);
    fireEvent.pointerDown(byId('a'), { pointerType: 'touch' });
    fireEvent.click(byId('a'), { detail: 1 });
    expect(selected(app)).toEqual(['b']);
  });

  it('a pen tap toggles the node', () => {
    const { app, byId } = renderStrip(['a']);
    fireEvent.pointerDown(byId('b'), { pointerType: 'pen' });
    fireEvent.click(byId('b'), { detail: 1 });
    expect(selected(app)).toEqual(['a', 'b']);
  });

  it('forgets the touch pointer type after the click, so a keyboard click replaces', () => {
    const { app, byId } = renderStrip();
    fireEvent.pointerDown(byId('a'), { pointerType: 'touch' });
    fireEvent.click(byId('a'), { detail: 1 });
    fireEvent.click(byId('b'));
    expect(selected(app)).toEqual(['b']);
  });

  // A pointer-made click has detail ≥ 1; a keyboard-made one (Enter/Space) has detail 0.
  it('a keyboard click after a touch that turned into a scroll replaces', () => {
    const { app, byId } = renderStrip(['c']);
    fireEvent.pointerDown(byId('a'), { pointerType: 'touch' });
    fireEvent.pointerCancel(byId('a'), { pointerType: 'touch' });
    fireEvent.click(byId('b'));
    expect(selected(app)).toEqual(['b']);
  });

  it('a keyboard click after a touch released outside the strip replaces', () => {
    const { app, byId } = renderStrip(['c']);
    fireEvent.pointerDown(byId('a'), { pointerType: 'touch' });
    fireEvent.click(byId('b'));
    expect(selected(app)).toEqual(['b']);
  });

  it('a mouse click after a cancelled touch replaces', () => {
    const { app, byId } = renderStrip(['c']);
    fireEvent.pointerDown(byId('a'), { pointerType: 'touch' });
    fireEvent.pointerCancel(byId('a'), { pointerType: 'touch' });
    fireEvent.click(byId('b'), { detail: 1 });
    expect(selected(app)).toEqual(['b']);
  });

  it('a click on the empty strip area clears the selection', () => {
    const { app, strip } = renderStrip(['a', 'b']);
    fireEvent.click(strip);
    expect(app.selection.size).toBe(0);
  });

  it('a click on a group frame selects the group; a click on a child selects the child', () => {
    const { app, byId } = renderStrip();
    fireEvent.click(screen.getByRole('button', { name: 'Group of 3' }));
    expect(selected(app)).toEqual(['g']);
    expect(byId('g')).toHaveClass('selected');
    fireEvent.click(byId('d'));
    expect(selected(app)).toEqual(['d']);
  });

  it('a selected group frame is pressed', () => {
    renderStrip(['h']);
    expect(screen.getByRole('button', { name: 'Group of 2' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Group of 3' })).toHaveAttribute('aria-pressed', 'false');
  });
});
