<script lang="ts">
  import type { Area } from '../core/dropTarget';
  import type { NodeId } from '../core/model';
  import type { AppState } from '../state.svelte';
  import type { Gesture } from './drag';
  import type { Pickup } from './dragDrop';
  import NodeView from './NodeView.svelte';
  import { selectMode } from './selection';

  // A view of one area's track. The drag gesture spans both strips, so it is owned by the Editor and passed in;
  // without it the strip only selects.
  let {
    app,
    area = 'pattern',
    gesture,
    dragging = new Set(),
    el = $bindable(),
  }: {
    app: AppState;
    area?: Area;
    gesture?: Gesture<Pickup>;
    /** Nodes picked up by the current drag (dimmed in place). */
    dragging?: ReadonlySet<NodeId>;
    el?: HTMLElement;
  } = $props();

  const track = $derived(app.trackOf(area));

  // The click's own pointerType is unreliable (WebKit says "mouse" after a touch tap), so remember it from the
  // pointerdown that led to the click.
  let lastPointerType = '';

  function onpointerdown(e: PointerEvent) {
    lastPointerType = e.pointerType;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const hit = e.target instanceof Element ? e.target.closest<HTMLElement>('[data-node-id]') : null;
    const id = hit?.dataset.nodeId;
    if (id !== undefined) gesture?.down(e, { id, area });
  }

  // A touch that turns into a scroll never clicks; don't let it leak into the next click.
  function onpointercancel() {
    lastPointerType = '';
  }

  function onclick(e: MouseEvent) {
    // The click that ends a drag is not a selection click (detail 0 = keyboard click, never swallowed).
    if (gesture?.consumeClick(e.detail === 0)) return;
    // Palette taps with nothing selected append to the strip tapped last.
    app.activeArea = area;
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

<!-- Keyboard users reach every node through its own <button>; clicks bubble here so one handler serves them all. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<section
  class="strip"
  class:is-dragging={dragging.size > 0}
  class:active={app.activeArea === area}
  class:prep={area === 'prep'}
  aria-label={area === 'pattern' ? 'Pattern' : 'Prepare'}
  bind:this={el}
  {onpointerdown}
  {onpointercancel}
  {onclick}
  oncontextmenu={(e) => e.preventDefault()}
>
  {#each track.nodes as node (node.id)}
    <NodeView {node} {app} {dragging} />
  {:else}
    {#if area === 'prep'}
      <p class="hint">Tap here, then pick sounds to build a figure. Drag it into the pattern to copy it.</p>
    {/if}
  {/each}
</section>

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

  /* Where palette taps append when nothing is selected. An inset shadow, so the layout doesn't move. */
  .strip.active {
    box-shadow: inset 0 0 0 2px color-mix(in srgb, var(--accent) 55%, transparent);
  }

  .strip.is-dragging {
    cursor: grabbing;
  }

  .hint {
    align-self: center;
    margin: 0;
    padding: 0 4px;
    color: var(--muted);
    font-size: 0.9rem;
  }

  /* Every top-level slot has the same size: width is time. */
  .strip > :global([data-node-id]) {
    flex: none;
    width: var(--slot-size);
    height: var(--slot-size);
  }
</style>
