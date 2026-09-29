<script lang="ts">
  import type { SeqNode } from '../core/model';
  import type { AppState } from '../state.svelte';

  let { node, app }: { node: SeqNode; app: AppState } = $props();
</script>

<div data-stub={node.id} data-n={app.selection.size}></div>
