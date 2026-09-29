<script lang="ts">
  import type { Sound, SoundId } from '../core/model';
  import type { RecordControl } from '../recordControl.svelte';

  let {
    sounds,
    onpick,
    armed = false,
    recording,
  }: {
    sounds: readonly Sound[];
    onpick: (soundId: SoundId | null) => void;
    /** The next pick sets the sound of the selection (SelectionBar "Sound"). */
    armed?: boolean;
    /** Record button and recordings' delete buttons; without it the palette only picks sounds. */
    recording?: RecordControl;
  } = $props();

  const id = $props.id();

  const builtIn = $derived(sounds.filter((s) => s.source !== 'recording'));
  const recorded = $derived(sounds.filter((s) => s.source === 'recording'));

  /** Recording whose delete button was pressed once and now asks for confirmation. */
  let confirming: SoundId | null = $state(null);

  // A press anywhere but on the armed delete button cancels it (touch browsers do not blur buttons on tap).
  function onWindowPointerdown(event: PointerEvent) {
    if (confirming === null) return;
    const target = event.target instanceof Element ? event.target.closest('[data-delete-id]') : null;
    if (target?.getAttribute('data-delete-id') !== confirming) confirming = null;
  }

  function onDelete(sound: Sound) {
    if (confirming !== sound.id) {
      confirming = sound.id;
      return;
    }
    confirming = null;
    recording?.remove(sound.id);
  }
</script>

<svelte:window onpointerdowncapture={onWindowPointerdown} />

{#snippet recordButton(control: RecordControl)}
  {@const active = control.status === 'recording'}
  <button
    type="button"
    class="sound record"
    class:active
    disabled={control.disabled}
    aria-label={active ? 'Stop recording' : undefined}
    aria-describedby={control.hint ? `${id}-hint` : undefined}
    onclick={() => void control.toggle()}
  >
    <span class="swatch"></span>
    {#if active}
      Stop <span class="time">{control.elapsed.toFixed(1)} s</span>
    {:else}
      Record
    {/if}
  </button>
{/snippet}

{#snippet soundButton(sound: Sound)}
  <button type="button" class="sound" style:--color={sound.color} onclick={() => onpick(sound.id)}>
    <span class="swatch"></span>{sound.name}
  </button>
{/snippet}

<div class="palette" class:armed role="group" aria-label="Sounds">
  {#if armed}
    <p class="hint">Pick a sound for the selection</p>
  {/if}
  {#each recording ? builtIn : sounds as sound (sound.id)}
    {@render soundButton(sound)}
  {/each}
  <button type="button" class="sound silent" onclick={() => onpick(null)}>
    <span class="swatch"></span>Silent
  </button>
  {#if recording}
    <!-- Recordings get wider cells: each has a delete button next to it. -->
    <div class="recordings">
      {#each recorded as sound (sound.id)}
        <div class="entry">
          {@render soundButton(sound)}
          <button
            type="button"
            class="delete"
            class:confirm={confirming === sound.id}
            data-delete-id={sound.id}
            aria-label={confirming === sound.id ? `Confirm delete ${sound.name}` : `Delete ${sound.name}`}
            onclick={() => onDelete(sound)}
            onblur={() => {
              if (confirming === sound.id) confirming = null;
            }}
          >
            {confirming === sound.id ? 'Delete?' : '×'}
          </button>
        </div>
      {/each}
      {@render recordButton(recording)}
    </div>
    {#if recording.hint}
      <p class="note" id="{id}-hint">{recording.hint}</p>
    {/if}
    <!-- Always present so screen readers announce a message when it appears. -->
    <p class="note error" role="status">{recording.message ?? ''}</p>
  {/if}
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

  .hint,
  .note {
    grid-column: 1 / -1;
    margin: 0 0 2px;
    font-size: 0.9rem;
  }

  .hint {
    color: var(--accent);
  }

  .note {
    color: var(--muted);
  }

  .note.error {
    color: #ff8a8a;
  }

  .note:empty {
    display: none;
  }

  .sound {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    min-height: 44px;
    padding: 0 10px;
    overflow: hidden;
    white-space: nowrap;
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

  .recordings {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 6px;
  }

  .entry {
    display: flex;
    gap: 4px;
  }

  .entry .sound {
    flex: 1;
  }

  .delete {
    flex: none;
    min-width: 44px;
    min-height: 44px;
    padding: 0 8px;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 8px;
    background: transparent;
    color: var(--muted);
    font: inherit;
    font-size: 1.2rem;
    cursor: pointer;
    touch-action: manipulation;
  }

  .delete.confirm {
    border-color: #ff5d5d;
    background: #ff5d5d;
    color: #16161d;
    font-size: 0.95rem;
    font-weight: 600;
  }

  .record {
    --color: #ff4d4d;
  }

  .record .swatch {
    border-radius: 50%;
  }

  .record.active {
    border-color: #ff4d4d;
    background: color-mix(in srgb, #ff4d4d 22%, var(--surface));
  }

  .record.active .swatch {
    border-radius: 3px;
  }

  .record:disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }

  .time {
    margin-left: auto;
    font-variant-numeric: tabular-nums;
  }
</style>
