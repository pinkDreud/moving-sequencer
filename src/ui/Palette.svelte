<script lang="ts">
  import type { Sound, SoundId } from '../core/model';

  let {
    sounds,
    onpick,
    armed = false,
  }: { sounds: readonly Sound[]; onpick: (soundId: SoundId | null) => void; armed?: boolean } = $props();
</script>

<div data-n={sounds.length} data-armed={armed} data-f={typeof onpick}></div>
