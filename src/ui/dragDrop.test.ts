import { describe, expect, it } from 'vitest';
import type { Area, AreaDrop, Drop } from '../core/dropTarget';
import { createIdGen } from '../core/model';
import { parseTrack, shape } from '../core/test-helpers';
import {
  applyAreaDrop,
  applyDrop,
  areaDropResult,
  copies,
  dragIds,
  dropResult,
  readLayout,
} from './dragDrop';
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
  const track = parseTrack('A G[B H[C D]] E');

  it('dragging a selected node drags the whole selection', () => {
    expect(dragIds(track, new Set(['A', 'C']), 'C').sort()).toEqual(['A', 'C']);
  });

  it('dragging an unselected node drags only it', () => {
    expect(dragIds(track, new Set(['A', 'C']), 'B')).toEqual(['B']);
  });

  it('pressing inside a selected group drags the selection (groups are hard to grab by their frame on touch)', () => {
    expect(dragIds(track, new Set(['G']), 'C')).toEqual(['G']);
    expect(dragIds(track, new Set(['H', 'E']), 'D').sort()).toEqual(['E', 'H']);
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

  it('combines on a combine drop: the dragged square and the target form a group', () => {
    const app = makeApp('A B C D');
    applyDrop(app, ['D'], { kind: 'combine', targetId: 'B', rect: { left: 0, top: 0, right: 0, bottom: 0 } });
    expect(shape(app.track)).toBe('A n1[B D] C');
  });

  it('dropResult is the unchanged track when the drop would change nothing', () => {
    const app = makeApp('A B C');
    const drop: Drop = { kind: 'combine', targetId: 'A', rect: { left: 0, top: 0, right: 0, bottom: 0 } };
    expect(dropResult(app.track, ['A'], drop)).toBe(app.track);
  });

  it('deletes on a delete drop and clears the deleted ids from the selection', () => {
    const app = makeApp('A B C', ['B']);
    applyDrop(app, ['B'], { kind: 'delete' });
    expect(shape(app.track)).toBe('A C');
    expect(app.selection.size).toBe(0);
  });
});

describe('dragIds across areas', () => {
  it('leaves out selected ids that are not in the pressed track (a mixed selection drags one area)', () => {
    const track = parseTrack('A B C');
    expect(dragIds(track, new Set(['A', 'P', 'C']), 'A').sort()).toEqual(['A', 'C']);
  });
});

describe('areaDropResult', () => {
  const tracks = () => ({ pattern: parseTrack('A B C', 'pat'), prep: parseTrack('P G[Q R]', 'prep') });
  const at = (area: Area, parentId: string | null, index: number): AreaDrop => ({
    area,
    kind: 'move',
    target: { parentId, index },
    indicator: { x: 0, top: 0, bottom: 0 },
  });
  const onto = (area: Area, targetId: string): AreaDrop => ({
    area,
    kind: 'combine',
    targetId,
    rect: { left: 0, top: 0, right: 0, bottom: 0 },
  });
  const run = (from: Area, ids: string[], drop: AreaDrop, alt = false) => {
    const before = tracks();
    const r = areaDropResult(before, from, ids, drop, { alt, nextId: createIdGen('n') });
    return { before, r, pattern: shape(r.tracks.pattern), prep: shape(r.tracks.prep) };
  };

  it('prep → pattern copies with fresh ids; the prep area is unchanged; the copies are placed', () => {
    const { before, r, pattern } = run('prep', ['G'], at('pattern', null, 1));
    expect(pattern).toBe('A n1[n2 n3] B C');
    expect(r.tracks.prep).toBe(before.prep);
    expect(r.placed).toEqual(['n1']);
  });

  it('prep → pattern with Alt moves', () => {
    const { pattern, prep, r } = run('prep', ['P'], at('pattern', null, 3), true);
    expect(pattern).toBe('A B C P');
    expect(prep).toBe('G[Q R]');
    expect(r.placed).toBeNull();
  });

  it('pattern → prep moves (Alt or not)', () => {
    expect(run('pattern', ['B'], at('prep', null, 0))).toMatchObject({ pattern: 'A C', prep: 'B P G[Q R]' });
    expect(run('pattern', ['B'], at('prep', null, 0), true)).toMatchObject({
      pattern: 'A C',
      prep: 'B P G[Q R]',
    });
  });

  it('inside one area it moves, as in 08 (Alt does not copy)', () => {
    const r1 = run('pattern', ['A'], at('pattern', null, 3), true);
    expect(r1).toMatchObject({ pattern: 'B C A' });
    expect(r1.r.tracks.prep).toBe(r1.before.prep);
    expect(run('prep', ['P'], at('prep', 'G', 1))).toMatchObject({ prep: 'G[Q P R]' });
  });

  it('combines across areas: a prep square copied onto a pattern square groups them', () => {
    expect(run('prep', ['P'], onto('pattern', 'B'))).toMatchObject({
      pattern: 'A n2[B n1] C',
      prep: 'P G[Q R]',
    });
  });

  it('delete removes the dragged nodes from the source area', () => {
    expect(run('prep', ['P'], { kind: 'delete' })).toMatchObject({ pattern: 'A B C', prep: 'G[Q R]' });
    expect(run('pattern', ['C'], { kind: 'delete' })).toMatchObject({ pattern: 'A B', prep: 'P G[Q R]' });
  });

  it('returns the same tracks when the drop changes nothing', () => {
    const { before, r } = run('pattern', ['A'], at('pattern', null, 0));
    expect(r.tracks.pattern).toBe(before.pattern);
    expect(r.tracks.prep).toBe(before.prep);
  });
});

describe('copies', () => {
  const drop = (area: Area): AreaDrop => ({
    area,
    kind: 'move',
    target: { parentId: null, index: 0 },
    indicator: { x: 0, top: 0, bottom: 0 },
  });

  it('only a drop from the prep area into the pattern without Alt copies', () => {
    expect(copies('prep', drop('pattern'), false)).toBe(true);
    expect(copies('prep', drop('pattern'), true)).toBe(false);
    expect(copies('prep', drop('prep'), false)).toBe(false);
    expect(copies('pattern', drop('prep'), false)).toBe(false);
    expect(copies('prep', { kind: 'delete' }, false)).toBe(false);
  });
});

describe('applyAreaDrop', () => {
  const into = (area: Area, index: number): AreaDrop => ({
    area,
    kind: 'move',
    target: { parentId: null, index },
    indicator: { x: 0, top: 0, bottom: 0 },
  });

  it('copies into the pattern and selects the copies', () => {
    const app = makeApp('A B', ['P'], 'P Q');
    applyAreaDrop(app, 'prep', ['P'], into('pattern', 2), false);
    expect(shape(app.track)).toBe('A B n1');
    expect(shape(app.prep)).toBe('P Q');
    expect([...app.selection]).toEqual(['n1']);
  });

  it('moves between areas keeping the moved nodes selected', () => {
    const app = makeApp('A B', ['B']);
    applyAreaDrop(app, 'pattern', ['B'], into('prep', 0), false);
    expect(shape(app.track)).toBe('A');
    expect(shape(app.prep)).toBe('B');
    expect([...app.selection]).toEqual(['B']);
  });
});
