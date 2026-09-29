<script lang="ts">
  import type { AppState } from '../state.svelte';

  let { app }: { app: AppState } = $props();
</script>

<main>
  <h1>Moving Sequencer</h1>
  <!-- 06: transport bar goes here -->
  <!-- 07: strip, palette and selection bar go here -->
  <p class="meta">{app.track.nodes.length} slots · {app.song.bpm} bpm</p>
</main>

<style>
  main {
    padding: 16px;
    max-width: 960px;
    margin: 0 auto;
  }

  .meta {
    color: var(--muted);
  }
</style>
