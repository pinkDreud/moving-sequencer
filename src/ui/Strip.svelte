<script lang="ts">
  import type { AppState } from '../state.svelte';
  import NodeView from './NodeView.svelte';
  import { selectMode } from './selection';

  let { app }: { app: AppState } = $props();

  // The click's own pointerType is unreliable (WebKit says "mouse" after a touch tap), so remember it from the
  // pointerdown that led to the click.
  let lastPointerType = '';

  function onpointerdown(e: PointerEvent) {
    lastPointerType = e.pointerType;
  }

  // A touch that turns into a scroll never clicks; don't let it leak into the next click.
  function onpointercancel() {
    lastPointerType = '';
  }

  function onclick(e: MouseEvent) {
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
<section class="strip" aria-label="Pattern" {onpointerdown} {onpointercancel} {onclick}>
  {#each app.track.nodes as node (node.id)}
    <NodeView {node} {app} />
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

  /* Every top-level slot has the same size: width is time. */
  .strip > :global([data-node-id]) {
    flex: none;
    width: var(--slot-size);
    height: var(--slot-size);
  }
</style>
