<script lang="ts">
  import type { AppState } from '../state.svelte';

  let { app, soundMode = $bindable(false) }: { app: AppState; soundMode?: boolean } = $props();
</script>

<div data-n={app.selection.size} data-sound={soundMode}></div>
