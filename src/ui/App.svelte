<script lang="ts">
  import type { AppState } from '../state.svelte';
  import Editor from './Editor.svelte';

  let { app }: { app: AppState } = $props();
</script>

<main>
  <h1>Moving Sequencer</h1>
  <!-- 06: transport bar goes here -->
  <Editor {app} />
</main>

<style>
  main {
    padding: 16px;
    max-width: 960px;
    margin: 0 auto;
  }
</style>
