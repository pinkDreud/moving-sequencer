<script lang="ts">
  import type { Transport as TransportController } from '../audio/transport';
  import Transport from './Transport.svelte';
  import type { AppState } from '../state.svelte';
  import Editor from './Editor.svelte';
  import type { RecordControl } from '../recordControl.svelte';
  import type { UpdateStatus } from '../updateStatus.svelte';
  import UpdateBar from './UpdateBar.svelte';

  // `transport` and `recording` are optional so the shell can render without audio (component tests).
  let {
    app,
    transport,
    recording,
    update,
  }: {
    app: AppState;
    transport?: TransportController;
    recording?: RecordControl;
    update?: UpdateStatus;
  } = $props();
</script>

<main>
  {#if update?.ready}<UpdateBar reload={() => location.reload()} />{/if}
  <h1>Moving Sequencer</h1>
  {#if transport}<Transport {app} {transport} />{/if}
  <Editor {app} {recording} />
</main>

<style>
  main {
    padding: 16px;
    max-width: 960px;
    margin: 0 auto;
  }
</style>
