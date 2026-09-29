<script lang="ts">
  import {
    dropTargetIn,
    type Area,
    type AreaDrop,
    type AreaItem,
    type AreaRect,
    type Point,
  } from '../core/dropTarget';
  import type { NodeId, SoundId } from '../core/model';
  import { findNode } from '../core/ops';
  import type { AppState } from '../state.svelte';
  import { pickSound, runShortcut } from './actions';
  import { createGesture } from './drag';
  import { applyAreaDrop, areaDropResult, copies, dragIds, readLayout, type Pickup } from './dragDrop';
  import Palette from './Palette.svelte';
  import type { RecordControl } from '../recordControl.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import { shortcutFor } from './shortcuts';
  import Strip from './Strip.svelte';

  let { app, recording }: { app: AppState; recording?: RecordControl } = $props();

  function onpick(soundId: SoundId | null) {
    pickSound(app, soundId);
  }

  function onkeydown(e: KeyboardEvent) {
    const shortcut = shortcutFor(e);
    // Without a selection only Ins does something (it appends); other keys keep their browser default.
    if (shortcut === null || (app.selection.size === 0 && shortcut !== 'insert')) return;
    e.preventDefault();
    runShortcut(app, shortcut);
  }

  // ---------- drag & drop: one gesture and one layout snapshot over both strips ----------

  let patternEl: HTMLElement | undefined = $state();
  let prepEl: HTMLElement | undefined = $state();
  /** The area the current drag started in. */
  let from: Area = $state('pattern');
  /** Set at pick-up, cleared at drop/cancel: kept apart from the per-move state so nodes don't re-render on moves. */
  let dragged: ReadonlySet<NodeId> = $state.raw(new Set());
  let drag = $state.raw<{ point: Point; drop: AreaDrop | null; alt: boolean } | null>(null);

  function dropAt(p: Point): AreaDrop | null {
    if (!patternEl || !prepEl) return null;
    // Measured on every move: cheap for a pattern's worth of nodes, and always right after scroll/resize/wrap.
    const strips: [Area, HTMLElement][] = [
      ['pattern', patternEl],
      ['prep', prepEl],
    ];
    const items: AreaItem[] = strips.flatMap(([area, el]) => readLayout(el).map((i) => ({ ...i, area })));
    const areas: AreaRect[] = strips.map(([area, el]) => {
      const { left, top, right, bottom } = el.getBoundingClientRect();
      return { area, rect: { left, top, right, bottom } };
    });
    return dropTargetIn(p, items, areas);
  }

  /** A drop that would change nothing (onto the dragged nodes themselves) draws no indicator. */
  function changes(drop: AreaDrop | null, alt: boolean): boolean {
    if (drop === null) return false;
    let n = 0;
    const tracks = { pattern: app.track, prep: app.prep };
    const r = areaDropResult(tracks, from, [...dragged], drop, { alt, nextId: () => `__probe${n++}__` });
    return r.tracks.pattern !== tracks.pattern || r.tracks.prep !== tracks.prep;
  }

  function end(): void {
    drag = null;
    dragged = new Set();
  }

  const gesture = createGesture<Pickup>({
    onStart({ id, area }, point) {
      const ids = dragIds(app.trackOf(area), app.selection, id);
      // Picking up something outside the selection makes it the selection.
      if (!ids.some((i) => app.selection.has(i))) app.select(ids);
      from = area;
      dragged = new Set(ids);
      drag = { point, drop: dropAt(point), alt: false };
    },
    onMove(point, { altKey }) {
      if (drag) drag = { point, drop: dropAt(point), alt: altKey };
    },
    onDrop(point, { altKey }) {
      const ids = [...dragged];
      end();
      const drop = dropAt(point);
      if (ids.length > 0 && drop) applyAreaDrop(app, from, ids, drop, altKey);
    },
    onCancel: end,
  });

  /** What the ghost shows: the color of each dragged node (null for groups and silent squares). */
  const ghost = $derived(
    [...dragged].map((id) => {
      const node = findNode(app.trackOf(from), id);
      const soundId = node?.kind === 'square' ? node.soundId : null;
      return soundId === null ? null : (app.soundById(soundId)?.color ?? null);
    }),
  );

  $effect(() => {
    // Alt pressed or released without moving the pointer: the Copy label must match what the release will do.
    const onalt = (e: KeyboardEvent) => {
      if (e.key === 'Alt' && drag) drag = { ...drag, alt: e.type === 'keydown' };
    };
    const onkeydowncapture = (e: KeyboardEvent) => {
      onalt(e);
      if (e.key !== 'Escape' || !gesture.dragging) return;
      // Capture phase, so the Escape shortcut (clear selection) does not also run.
      e.preventDefault();
      e.stopPropagation();
      gesture.cancel();
    };
    // Once a touch drag has picked something up, the finger must move it, not scroll the page.
    const ontouchmove = (e: TouchEvent) => {
      if (gesture.dragging) e.preventDefault();
    };
    // Switching app/tab mid-drag loses the pointerup: never leave a drag hanging to drop on the next click.
    const abandon = () => gesture.cancel();
    window.addEventListener('keydown', onkeydowncapture, true);
    window.addEventListener('keyup', onalt, true);
    window.addEventListener('touchmove', ontouchmove, { passive: false });
    window.addEventListener('blur', abandon);
    document.addEventListener('visibilitychange', abandon);
    return () => {
      window.removeEventListener('keydown', onkeydowncapture, true);
      window.removeEventListener('keyup', onalt, true);
      window.removeEventListener('touchmove', ontouchmove);
      window.removeEventListener('blur', abandon);
      document.removeEventListener('visibilitychange', abandon);
      gesture.cancel();
    };
  });
</script>

<svelte:window
  {onkeydown}
  onpointerdowncapture={() => gesture.pressedAnywhere()}
  onpointermove={(e) => gesture.move(e)}
  onpointerup={(e) => gesture.up(e)}
  onpointercancel={(e) => gesture.cancel(e)}
/>

<div class="editor">
  <Strip {app} area="pattern" {gesture} dragging={dragged} bind:el={patternEl} />
  <Palette sounds={app.sounds} {onpick} {recording} />
  <div class="prep-area">
    <h2>Prepare</h2>
    <Strip {app} area="prep" {gesture} dragging={dragged} bind:el={prepEl} />
  </div>
  <SelectionBar {app} />
</div>

{#if drag}
  {#if drag.drop?.kind === 'move' && changes(drag.drop, drag.alt)}
    {@const { x, top, bottom } = drag.drop.indicator}
    <div class="drop-indicator" style:left="{x}px" style:top="{top}px" style:height="{bottom - top}px"></div>
  {:else if drag.drop?.kind === 'combine' && changes(drag.drop, drag.alt)}
    {@const { left, top, right, bottom } = drag.drop.rect}
    <!-- 4 px outside the target square, so the outline doesn't cover it. -->
    <div
      class="drop-combine"
      style:left="{left - 4}px"
      style:top="{top - 4}px"
      style:width="{right - left + 8}px"
      style:height="{bottom - top + 8}px"
    ></div>
  {/if}
  <div
    class="ghost"
    class:delete={drag.drop?.kind === 'delete'}
    style:transform="translate({drag.point.x}px, {drag.point.y}px)"
    aria-hidden="true"
  >
    {#each ghost.slice(0, 4) as color, i (i)}
      <span class="swatch" class:empty={color === null} style:--color={color}></span>
    {/each}
    {#if ghost.length > 4}<span class="more">+{ghost.length - 4}</span>{/if}
    {#if drag.drop?.kind === 'delete'}
      <span class="label">Release to delete</span>
    {:else if drag.drop && copies(from, drag.drop, drag.alt) && changes(drag.drop, drag.alt)}
      <span class="label">Copy</span>
    {/if}
  </div>
{/if}

<style>
  .prep-area {
    margin-top: 16px;
  }

  .prep-area h2 {
    margin: 0 0 8px 4px;
    color: var(--muted);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .drop-indicator {
    position: fixed;
    z-index: 10;
    width: 4px;
    margin-left: -2px;
    border-radius: 2px;
    background: var(--accent);
    box-shadow: 0 0 8px var(--accent);
    pointer-events: none;
  }

  /* "Group with this square": an outline around the target, instead of an insertion line. */
  .drop-combine {
    position: fixed;
    z-index: 10;
    border: 3px dashed var(--accent);
    border-radius: 12px;
    box-shadow: 0 0 10px var(--accent);
    pointer-events: none;
  }

  .ghost {
    position: fixed;
    top: 0;
    left: 0;
    z-index: 11;
    display: flex;
    align-items: center;
    gap: 3px;
    margin: -18px 0 0 12px;
    padding: 4px;
    border-radius: 8px;
    background: rgb(0 0 0 / 0.6);
    pointer-events: none;
  }

  .ghost .swatch {
    width: 28px;
    height: 28px;
    border-radius: 6px;
    background: var(--color);
  }

  .ghost .swatch.empty {
    border: 1.5px dashed rgb(255 255 255 / 0.5);
    background: transparent;
  }

  .ghost .more,
  .ghost .label {
    padding: 0 4px;
    font-size: 13px;
    white-space: nowrap;
  }

  .ghost.delete {
    background: rgb(200 40 40 / 0.85);
  }
</style>
