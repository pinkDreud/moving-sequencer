<script lang="ts">
  import type { TrackSync } from '../core/model';
  import { MAX_TRACKS, type AppState } from '../state.svelte';

  let { app }: { app: AppState } = $props();

  const id = $props.id();
  const SYNCS: readonly { sync: TrackSync; label: string; hint: string }[] = [
    {
      sync: 'slot',
      label: 'Same slots',
      hint: 'A slot lasts as long as a master slot: the track loops on its own.',
    },
    { sync: 'loop', label: 'Same loop', hint: 'The whole track lasts as long as the master loop.' },
  ];

  const sync = $derived(app.track.sync ?? 'slot');

  /** The track whose Remove was pressed once. Keyed by track, so showing another tab forgets the press. */
  let confirmFor: string | null = $state(null);
  const confirming = $derived(confirmFor === app.track.id);

  function select(index: number): void {
    // Not left to blur alone: WebKit buttons take no focus on click, so the Remove button never blurs there.
    confirmFor = null;
    app.selectTrack(index);
  }

  function remove(): void {
    if (!confirming) {
      confirmFor = app.track.id;
      return;
    }
    confirmFor = null;
    app.removeTrack(app.activeTrack);
  }
</script>

<div class="tracks">
  <div class="tabs" role="tablist" aria-label="Tracks">
    {#each app.song.tracks as track, i (track.id)}
      <button type="button" role="tab" aria-selected={i === app.activeTrack} onclick={() => select(i)}>
        {i === 0 ? 'Master' : `Track ${i + 1}`}
      </button>
    {/each}
    <button
      type="button"
      class="add"
      aria-label="Add track"
      disabled={app.song.tracks.length >= MAX_TRACKS}
      onclick={() => app.addTrack()}
    >
      +
    </button>
  </div>

  {#if app.activeTrack > 0}
    <div class="options">
      <span class="label" id="{id}-sync">Sync</span>
      <div class="sync" role="radiogroup" aria-labelledby="{id}-sync">
        {#each SYNCS as option (option.sync)}
          <label class="seg">
            <input
              type="radio"
              name="{id}-sync"
              value={option.sync}
              checked={sync === option.sync}
              onchange={() => app.setTrackSync(app.activeTrack, option.sync)}
            />
            <span>{option.label}</span>
          </label>
        {/each}
      </div>
      <!-- Not undoable, so it takes two presses; moving on (blur, a tab press) forgets the first. -->
      <button
        type="button"
        class="remove"
        class:confirming
        onclick={remove}
        onblur={() => (confirmFor = null)}
      >
        {confirming ? 'Remove?' : 'Remove track'}
      </button>
      <p class="hint">{SYNCS.find((o) => o.sync === sync)?.hint}</p>
    </div>
  {/if}
</div>

<style>
  .tracks {
    margin-bottom: 8px;
  }

  .tabs {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  button {
    min-width: 44px;
    min-height: 44px;
    padding: 0 12px;
    border: 1px solid color-mix(in srgb, var(--fg) 25%, var(--bg));
    border-radius: 8px;
    background: color-mix(in srgb, var(--fg) 8%, var(--bg));
    color: var(--fg);
    font: inherit;
    font-size: 15px;
    cursor: pointer;
    touch-action: manipulation;
  }

  button[aria-selected='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .add {
    font-size: 20px;
  }

  .options {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }

  .label,
  .hint {
    color: var(--muted);
    font-size: 12px;
  }

  .hint {
    flex: 1 0 100%;
    margin: 0;
  }

  .remove {
    margin-left: auto;
  }

  .remove.confirming {
    border-color: #c82828;
    background: #c82828;
    color: #fff;
  }

  /* Segmented control, as in the transport: real radio inputs drawn as joined buttons. */
  .sync {
    display: flex;
    min-height: 44px;
    border: 1px solid color-mix(in srgb, var(--fg) 25%, var(--bg));
    border-radius: 8px;
    overflow: hidden;
  }

  .seg {
    position: relative;
    display: flex;
  }

  .seg input {
    position: absolute;
    width: 100%;
    height: 100%;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .seg span {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    padding: 0 10px;
    background: color-mix(in srgb, var(--fg) 8%, var(--bg));
    color: var(--fg);
    font-size: 15px;
  }

  .seg + .seg span {
    border-left: 1px solid color-mix(in srgb, var(--fg) 25%, var(--bg));
  }

  .seg input:checked + span {
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }

  .seg input:focus-visible + span {
    outline: 2px solid var(--fg);
    outline-offset: -3px;
  }
</style>
