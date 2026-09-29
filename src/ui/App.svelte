<script lang="ts">
  import type { Transport as TransportController } from '../audio/transport';
  import Transport from './Transport.svelte';
  import type { AppState } from '../state.svelte';
  import Editor from './Editor.svelte';

  // `transport` is optional so the shell can render without audio (component tests).
  let { app, transport }: { app: AppState; transport?: TransportController } = $props();
</script>

<main>
  <h1>Moving Sequencer</h1>
  {#if transport}<Transport {app} {transport} />{/if}
  <Editor {app} />
</main>

<style>
  main {
    padding: 16px;
    max-width: 960px;
    margin: 0 auto;
  }
</style>
