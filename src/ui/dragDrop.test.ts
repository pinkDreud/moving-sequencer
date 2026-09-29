import { describe, expect, it } from 'vitest';
import type { Drop } from '../core/dropTarget';
import { shape } from '../core/test-helpers';
import { applyDrop, dragIds, readLayout } from './dragDrop';
import { makeApp } from './test-helpers';

/** Builds the Strip DOM shape (section > nodes; group > frame + .children > nodes) with fake rects. */
function stripDom(): HTMLElement {
  const strip = document.createElement('section');
  strip.innerHTML = `
    <button data-node-id="A" class="square"></button>
    <div data-node-id="G" class="group">
      <button class="frame"></button>
      <div class="children">
        <button data-node-id="B" class="square"></button>
        <div data-node-id="H" class="group">
          <button class="frame"></button>
          <div class="children">
            <button data-node-id="C" class="square"></button>
            <button data-node-id="D" class="square"></button>
          </div>
        </div>
      </div>
    </div>
    <button data-node-id="E" class="square"></button>`;
  strip.querySelectorAll<HTMLElement>('[data-node-id]').forEach((el, i) => {
    el.getBoundingClientRect = () => ({ left: i * 10, top: 0, right: i * 10 + 5, bottom: 5 }) as DOMRect;
  });
  return strip;
}

describe('readLayout', () => {
  it('reads id, parent, index, depth and kind of every node in document order', () => {
    const layout = readLayout(stripDom()).map(({ id, parentId, index, depth, kind }) => ({
      id,
      parentId,
      index,
      depth,
      kind,
    }));
    expect(layout).toEqual([
      { id: 'A', parentId: null, index: 0, depth: 0, kind: 'square' },
      { id: 'G', parentId: null, index: 1, depth: 0, kind: 'group' },
      { id: 'B', parentId: 'G', index: 0, depth: 1, kind: 'square' },
      { id: 'H', parentId: 'G', index: 1, depth: 1, kind: 'group' },
      { id: 'C', parentId: 'H', index: 0, depth: 2, kind: 'square' },
      { id: 'D', parentId: 'H', index: 1, depth: 2, kind: 'square' },
      { id: 'E', parentId: null, index: 2, depth: 0, kind: 'square' },
    ]);
  });

  it('copies each element rect', () => {
    expect(readLayout(stripDom())[2]?.rect).toEqual({ left: 20, top: 0, right: 25, bottom: 5 });
  });
});

describe('dragIds', () => {
  it('dragging a selected node drags the whole selection', () => {
    expect(dragIds(new Set(['A', 'C']), 'C').sort()).toEqual(['A', 'C']);
  });

  it('dragging an unselected node drags only it', () => {
    expect(dragIds(new Set(['A', 'C']), 'B')).toEqual(['B']);
  });
});

describe('applyDrop', () => {
  const move = (parentId: string | null, index: number): Drop => ({
    kind: 'move',
    target: { parentId, index },
    indicator: { x: 0, top: 0, bottom: 0 },
  });

  it('moves the dragged nodes to the target', () => {
    const app = makeApp('A B C D E');
    applyDrop(app, ['B', 'C', 'D'], move(null, 5));
    expect(shape(app.track)).toBe('A E B C D');
  });

  it('moves into a group', () => {
    const app = makeApp('A G[B C] D');
    applyDrop(app, ['D'], move('G', 1));
    expect(shape(app.track)).toBe('A G[B D C]');
  });

  it('deletes on a delete drop and clears the deleted ids from the selection', () => {
    const app = makeApp('A B C', ['B']);
    applyDrop(app, ['B'], { kind: 'delete' });
    expect(shape(app.track)).toBe('A C');
    expect(app.selection.size).toBe(0);
  });
});
