<script lang="ts">
  import type { AppState } from '../state.svelte';

  let { app }: { app: AppState } = $props();
</script>

<div data-n={app.selection.size}></div>
