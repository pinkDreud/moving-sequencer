<script lang="ts">
  import type { AppState } from '../state.svelte';

  let { app }: { app: AppState } = $props();
</script>

<section aria-label="Pattern" data-slots={app.track.nodes.length}></section>
