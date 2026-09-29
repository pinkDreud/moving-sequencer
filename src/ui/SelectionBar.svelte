<script lang="ts">
  import type { AppState } from '../state.svelte';
  import { deleteSelection, groupSelection, toggleMuteSelection, ungroupSelection } from './actions';
  import { allMuted, canGroup, selectedGroupIds } from './selection';

  let { app }: { app: AppState } = $props();

  const muted = $derived(allMuted(app.track, app.selection));
  const groupable = $derived(canGroup(app.track, app.selection));
  const hasGroup = $derived(selectedGroupIds(app.track, app.selection).length > 0);
</script>

{#if app.selection.size > 0}
  <div class="bar" role="toolbar" aria-label="Selection">
    <span class="count">{app.selection.size} selected</span>
    <button type="button" onclick={() => toggleMuteSelection(app)}>{muted ? 'Unmute' : 'Mute'}</button>
    <button type="button" disabled={!groupable} onclick={() => groupSelection(app)}>Group</button>
    <button type="button" disabled={!hasGroup} onclick={() => ungroupSelection(app)}>Ungroup</button>
    <button type="button" class="danger" onclick={() => deleteSelection(app)}>Delete</button>
    <button type="button" class="clear" aria-label="Clear selection" onclick={() => app.clearSelection()}>
      ×
    </button>
  </div>
{/if}

<style>
  .bar {
    position: sticky;
    bottom: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
    margin-top: 12px;
    padding: 8px 8px calc(8px + env(safe-area-inset-bottom));
    border-radius: 12px;
    background: color-mix(in srgb, var(--surface) 92%, transparent);
    backdrop-filter: blur(6px);
    box-shadow: 0 -4px 16px rgb(0 0 0 / 0.35);
  }

  .count {
    flex: 1 0 100%;
    color: var(--muted);
    font-size: 0.85rem;
  }

  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0 12px;
    border: 1px solid rgb(255 255 255 / 0.15);
    border-radius: 8px;
    background: var(--bg);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }

  button:disabled {
    opacity: 0.4;
    cursor: default;
  }

  .danger {
    color: #ff7b7b;
  }

  .clear {
    margin-left: auto;
    font-size: 1.3rem;
  }

  @media (min-width: 600px) {
    .count {
      flex: none;
      margin-right: 4px;
    }
  }
</style>
