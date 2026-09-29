<script lang="ts">
  import type { SoundId } from '../core/model';
  import type { AppState } from '../state.svelte';
  import { pickSound, runShortcut } from './actions';
  import Palette from './Palette.svelte';
  import type { RecordControl } from '../recordControl.svelte';
  import SelectionBar from './SelectionBar.svelte';
  import { shortcutFor } from './shortcuts';
  import Strip from './Strip.svelte';

  let { app, recording }: { app: AppState; recording?: RecordControl } = $props();

  function onpick(soundId: SoundId | null) {
    pickSound(app, soundId);
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
  <Palette sounds={app.sounds} {onpick} {recording} />
  <SelectionBar {app} />
</div>
