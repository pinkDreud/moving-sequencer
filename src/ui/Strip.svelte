<script lang="ts">
  import { dropTarget, type Drop, type Point } from '../core/dropTarget';
  import type { NodeId } from '../core/model';
  import { findNode, move } from '../core/ops';
  import type { AppState } from '../state.svelte';
  import { createGesture } from './drag';
  import { applyDrop, dragIds, readLayout } from './dragDrop';
  import NodeView from './NodeView.svelte';
  import { selectMode } from './selection';

  let { app }: { app: AppState } = $props();

  let stripEl: HTMLElement | undefined = $state();
  /** Set at pick-up, cleared at drop/cancel: kept apart from the per-move state so nodes don't re-render on moves. */
  let dragged: ReadonlySet<NodeId> = $state.raw(new Set());
  let drag = $state.raw<{ point: Point; drop: Drop | null } | null>(null);

  function dropAt(p: Point): Drop | null {
    // Measured on every move: cheap for a pattern's worth of nodes, and always right after scroll/resize/wrap.
    return stripEl ? dropTarget(p, readLayout(stripEl), stripEl.getBoundingClientRect()) : null;
  }

  /** A drop that would change nothing (onto the dragged nodes themselves) draws no insertion line. */
  function changes(drop: Drop | null): boolean {
    if (drop?.kind !== 'move') return drop !== null;
    return move(app.track, [...dragged], drop.target) !== app.track;
  }

  function end(): void {
    drag = null;
    dragged = new Set();
  }

  const gesture = createGesture<NodeId>({
    onStart(id, point) {
      const ids = dragIds(app.track, app.selection, id);
      // Picking up something outside the selection makes it the selection.
      if (!ids.some((i) => app.selection.has(i))) app.select(ids);
      dragged = new Set(ids);
      drag = { point, drop: dropAt(point) };
    },
    onMove(point) {
      if (drag) drag = { point, drop: dropAt(point) };
    },
    onDrop(point) {
      const ids = [...dragged];
      end();
      const drop = dropAt(point);
      if (ids.length > 0 && drop) applyDrop(app, ids, drop);
    },
    onCancel: end,
  });

  /** What the ghost shows: the color of each dragged node (null for groups and silent squares). */
  const ghost = $derived(
    [...dragged].map((id) => {
      const node = findNode(app.track, id);
      const soundId = node?.kind === 'square' ? node.soundId : null;
      return soundId === null ? null : (app.soundById(soundId)?.color ?? null);
    }),
  );

  $effect(() => {
    const onkeydown = (e: KeyboardEvent) => {
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
    window.addEventListener('keydown', onkeydown, true);
    window.addEventListener('touchmove', ontouchmove, { passive: false });
    window.addEventListener('blur', abandon);
    document.addEventListener('visibilitychange', abandon);
    return () => {
      window.removeEventListener('keydown', onkeydown, true);
      window.removeEventListener('touchmove', ontouchmove);
      window.removeEventListener('blur', abandon);
      document.removeEventListener('visibilitychange', abandon);
      gesture.cancel();
    };
  });

  // The click's own pointerType is unreliable (WebKit says "mouse" after a touch tap), so remember it from the
  // pointerdown that led to the click.
  let lastPointerType = '';

  function onpointerdown(e: PointerEvent) {
    lastPointerType = e.pointerType;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hit = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-node-id]') : null;
    const id = hit?.dataset.nodeId;
    if (id !== undefined) gesture.down(e, id);
  }

  // A touch that turns into a scroll never clicks; don't let it leak into the next click.
  function onpointercancel() {
    lastPointerType = '';
  }

  function onclick(e: MouseEvent) {
    // The click that ends a drag is not a selection click (detail 0 = keyboard click, never swallowed).
    if (gesture.consumeClick(e.detail === 0)) return;
    // detail 0 = click made by the keyboard (Enter/Space), whatever pointer was pressed before.
    const fromPointer = e.detail > 0;
    const own = 'pointerType' in e ? String(e.pointerType) : '';
    const pointerType = fromPointer ? lastPointerType || own : '';
    lastPointerType = '';
    const hit = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-node-id]') : null;
    const id = hit?.dataset.nodeId;
    if (id === undefined) {
      app.clearSelection();
      return;
    }
    const mode = selectMode({ pointerType, shiftKey: e.shiftKey, metaKey: e.metaKey, ctrlKey: e.ctrlKey });
    if (mode === 'toggle') app.toggle(id);
    else app.select([id]);
  }
</script>

<svelte:window
  onpointerdowncapture={() => gesture.pressedAnywhere()}
  onpointermove={(e) => gesture.move(e)}
  onpointerup={(e) => gesture.up(e)}
  onpointercancel={(e) => gesture.cancel(e)}
/>

<!-- Keyboard users reach every node through its own <button>; clicks bubble here so one handler serves them all. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<section
  class="strip"
  class:is-dragging={drag !== null}
  aria-label="Pattern"
  bind:this={stripEl}
  {onpointerdown}
  {onpointercancel}
  {onclick}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each app.track.nodes as node (node.id)}
    <NodeView {node} {app} dragging={dragged} />
  {/each}
</section>

{#if drag}
  {#if drag.drop?.kind === 'move' && changes(drag.drop)}
    {@const { x, top, bottom } = drag.drop.indicator}
    <div class="drop-indicator" style:left="{x}px" style:top="{top}px" style:height="{bottom - top}px"></div>
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
    {#if drag.drop?.kind === 'delete'}<span class="label">Release to delete</span>{/if}
  </div>
{/if}

<style>
  .strip {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    gap: var(--slot-gap);
    min-height: calc(var(--slot-size) + 20px);
    padding: 10px;
    border-radius: 12px;
    background: var(--surface);
    user-select: none;
    -webkit-user-select: none;
    -webkit-touch-callout: none;
    touch-action: manipulation;
  }

  .strip.is-dragging {
    cursor: grabbing;
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

  /* Every top-level slot has the same size: width is time. */
  .strip > :global([data-node-id]) {
    flex: none;
    width: var(--slot-size);
    height: var(--slot-size);
  }
</style>
