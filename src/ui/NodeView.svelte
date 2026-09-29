<script lang="ts">
  import type { SeqNode } from '../core/model';
  import type { AppState } from '../state.svelte';
  import NodeView from './NodeView.svelte';

  let { node, app }: { node: SeqNode; app: AppState } = $props();

  const selected = $derived(app.selection.has(node.id));

  function soundOf(soundId: string | null) {
    return soundId === null ? undefined : app.soundById(soundId);
  }

  function labelOf(soundId: string | null, muted: boolean): string {
    const name = soundId === null ? 'silent' : (soundOf(soundId)?.name ?? soundId);
    return muted ? `${name}, muted` : name;
  }
</script>

<!-- Selection clicks are handled once, by delegation, in Strip.svelte; `data-node-id` is the hook. -->
{#if node.kind === 'square'}
  <button
    type="button"
    class="square"
    class:silent={node.soundId === null}
    class:muted={node.muted}
    class:selected
    class:playing={app.playheadId === node.id}
    data-node-id={node.id}
    aria-label={labelOf(node.soundId, node.muted)}
    aria-pressed={selected}
    style:--color={soundOf(node.soundId)?.color}
  ></button>
{:else}
  <div class="group" class:selected data-node-id={node.id}>
    <!-- The frame sits behind the children and shows as the group's padding: tapping it selects the group. -->
    <button type="button" class="frame" aria-label="Group of {node.children.length}" aria-pressed={selected}
    ></button>
    <div class="children">
      {#each node.children as child (child.id)}
        <NodeView node={child} {app} />
      {/each}
    </div>
  </div>
{/if}

<style>
  .square {
    appearance: none;
    display: block;
    margin: 0;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--color, #777);
    cursor: pointer;
    font: inherit;
  }

  .square.silent {
    background: repeating-linear-gradient(135deg, transparent 0 5px, rgb(255 255 255 / 0.09) 5px 7px);
    border: 1.5px dashed rgb(255 255 255 / 0.35);
  }

  /* Dimmed and desaturated, but the sound color is still recognisable. */
  .square.muted {
    background: color-mix(in srgb, var(--color, #777) 30%, var(--bg));
    box-shadow: inset 0 0 0 1.5px color-mix(in srgb, var(--color, #777) 55%, transparent);
  }

  .square.silent.muted {
    background: transparent;
    border-color: rgb(255 255 255 / 0.15);
    box-shadow: none;
  }

  .square.playing {
    filter: brightness(1.35);
    box-shadow:
      inset 0 0 0 3px #fff,
      0 0 12px 2px var(--color, #fff);
  }

  .square.selected {
    outline: 3px solid var(--accent);
    outline-offset: 2px;
  }

  .square:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: -2px;
  }

  .square.selected:focus-visible {
    outline-color: var(--accent);
    outline-width: 4px;
  }

  .group {
    position: relative;
    padding: 5px;
    border-radius: 10px;
  }

  .frame {
    appearance: none;
    position: absolute;
    inset: 0;
    margin: 0;
    padding: 0;
    border: 1.5px solid rgb(255 255 255 / 0.4);
    border-radius: inherit;
    background: rgb(255 255 255 / 0.05);
    cursor: pointer;
  }

  .frame:focus-visible {
    outline: 2px solid var(--fg);
    outline-offset: 1px;
  }

  .group.selected > .frame {
    border: 3px solid var(--accent);
    background: color-mix(in srgb, var(--accent) 18%, transparent);
  }

  .children {
    position: relative;
    display: flex;
    gap: 2px;
    height: 100%;
    overflow: hidden;
    border-radius: 6px;
    /* Gaps between children fall through to the frame, i.e. select the group. */
    pointer-events: none;
  }

  /* Children are rendered by nested NodeView instances, which Svelte's CSS scoping cannot see from here. */
  .children > :global([data-node-id]) {
    flex: 1 1 0;
    min-width: 6px;
    pointer-events: auto;
  }

  .children > :global(.group) {
    padding: 3px;
  }

  .children > :global(.square) {
    border-radius: 4px;
  }

  /* Inset inside groups, which clip their children; the dark inner ring keeps it readable on any color. */
  .children > :global(.square.selected) {
    outline-offset: -3px;
    box-shadow: inset 0 0 0 5px rgb(0 0 0 / 0.45);
  }
</style>
