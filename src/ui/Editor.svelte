<script lang="ts">
  import type { SoundId } from '../core/model';
  import type { AppState } from '../state.svelte';
  import { pickSound, runShortcut } from './actions';
  import Palette from './Palette.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import { shortcutFor } from './shortcuts';
  import Strip from './Strip.svelte';

  let { app }: { app: AppState } = $props();

  let soundMode = $state(false);

  // Sound mode belongs to a selection: once nothing is selected it has nothing to apply to.
  $effect(() => {
    if (app.selection.size === 0) soundMode = false;
  });

  function onpick(soundId: SoundId | null) {
    pickSound(app, soundId, soundMode);
    soundMode = false;
  }

  function onkeydown(e: KeyboardEvent) {
    const shortcut = shortcutFor(e);
    if (shortcut === null || app.selection.size === 0) return;
    e.preventDefault();
    runShortcut(app, shortcut);
  }
</script>

<svelte:window {onkeydown} />

<div class="editor">
  <Strip {app} />
  <Palette sounds={app.sounds} {onpick} armed={soundMode} />
  <SelectionBar {app} bind:soundMode />
</div>
