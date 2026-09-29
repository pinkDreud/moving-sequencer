<script lang="ts">
  import type { Sound, SoundId } from '../core/model';

  let {
    sounds,
    onpick,
    armed = false,
  }: {
    sounds: readonly Sound[];
    onpick: (soundId: SoundId | null) => void;
    /** The next pick sets the sound of the selection (SelectionBar "Sound"). */
    armed?: boolean;
  } = $props();
</script>

<div class="palette" class:armed role="group" aria-label="Sounds">
  {#if armed}
    <p class="hint">Pick a sound for the selection</p>
  {/if}
  {#each sounds as sound (sound.id)}
    <button type="button" class="sound" style:--color={sound.color} onclick={() => onpick(sound.id)}>
      <span class="swatch"></span>{sound.name}
    </button>
  {/each}
  <button type="button" class="sound silent" onclick={() => onpick(null)}>
    <span class="swatch"></span>Silent
  </button>
</div>

<style>
  .palette {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
    gap: 6px;
    margin-top: 12px;
    padding: 8px;
    border: 2px solid transparent;
    border-radius: 12px;
  }

  .palette.armed {
    border-color: var(--accent);
  }

  .hint {
    grid-column: 1 / -1;
    margin: 0 0 2px;
    color: var(--accent);
    font-size: 0.9rem;
  }

  .sound {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
    padding: 0 10px;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 8px;
    background: var(--surface);
    color: var(--fg);
    font: inherit;
    cursor: pointer;
    touch-action: manipulation;
  }

  .sound:hover {
    border-color: var(--color, var(--muted));
  }

  .swatch {
    flex: none;
    width: 18px;
    height: 18px;
    border-radius: 4px;
    background: var(--color);
  }

  .silent .swatch {
    background: repeating-linear-gradient(135deg, transparent 0 3px, rgb(255 255 255 / 0.2) 3px 5px);
    border: 1.5px dashed rgb(255 255 255 / 0.4);
  }
</style>
