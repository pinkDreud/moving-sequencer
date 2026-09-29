<script lang="ts">
  import type { Transport } from '../audio/transport';
  import type { SlotValue, TempoFactor } from '../core/model';
  import type { AppState } from '../state.svelte';

  let { app, transport }: { app: AppState; transport: Transport } = $props();

  const id = $props.id();
  const SLOT_VALUES: readonly SlotValue[] = [4, 8, 16];
  const SPEEDS: readonly { factor: TempoFactor; label: string }[] = [
    { factor: 0.5, label: '½×' },
    { factor: 1, label: '1×' },
    { factor: 2, label: '2×' },
  ];

  /** Applies the typed tempo (clamped by the state) and shows what was actually stored. */
  function commitBpm(input: HTMLInputElement): void {
    const bpm = input.valueAsNumber; // NaN when empty or invalid: setBpm ignores it and the field reverts
    if (bpm !== app.song.bpm) app.setBpm(bpm);
    // When clamping leaves the stored value unchanged, Svelte has nothing to update, so reset the field here.
    input.value = String(app.song.bpm);
  }

  function selectSlotValue(value: string): void {
    const slotValue = SLOT_VALUES.find((v) => String(v) === value);
    if (slotValue) app.setSlotValue(slotValue);
  }

  const swingPercent = $derived(Math.round((app.song.swing ?? 0) * 100));

  /**
   * Controls where Space types, picks or opens a list; everywhere else (buttons and the swing slider included)
   * it means play/stop.
   */
  function isTextEntry(target: EventTarget | null): boolean {
    return (
      target instanceof HTMLElement &&
      (target.isContentEditable || target.matches('input:not([type="range"]), textarea, select'))
    );
  }

  function onWindowKeydown(event: KeyboardEvent): void {
    if (event.key !== ' ' || event.repeat || event.defaultPrevented) return;
    if (event.ctrlKey || event.metaKey || event.altKey || isTextEntry(event.target)) return;
    // Also stops the page from scrolling and a focused button from being pressed (it would toggle twice).
    event.preventDefault();
    void transport.toggle();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<section class="transport" aria-label="Transport">
  <button type="button" class="play" aria-pressed={app.playing} onclick={() => void transport.toggle()}>
    <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true">
      {#if app.playing}
        <rect x="3" y="3" width="10" height="10" rx="1" />
      {:else}
        <path d="M4 2.5v11l9.5-5.5z" />
      {/if}
    </svg>
    {app.playing ? 'Stop' : 'Play'}
  </button>

  <div class="field">
    <label for="{id}-bpm">BPM</label>
    <input
      id="{id}-bpm"
      class="bpm"
      type="number"
      inputmode="numeric"
      min="30"
      max="300"
      step="1"
      value={app.song.bpm}
      onchange={(event) => commitBpm(event.currentTarget)}
      onblur={(event) => commitBpm(event.currentTarget)}
      onkeydown={(event) => {
        if (event.key === 'Enter') commitBpm(event.currentTarget);
      }}
    />
  </div>

  <div class="field">
    <span class="label" id="{id}-speed">Speed</span>
    <div class="speed" role="radiogroup" aria-labelledby="{id}-speed">
      {#each SPEEDS as speed (speed.factor)}
        <label class="seg">
          <input
            type="radio"
            name="{id}-speed"
            value={speed.factor}
            checked={(app.song.tempoFactor ?? 1) === speed.factor}
            onchange={() => app.setTempoFactor(speed.factor)}
          />
          <span>{speed.label}</span>
        </label>
      {/each}
    </div>
  </div>

  <div class="field">
    <label for="{id}-swing">Swing</label>
    <div class="swing">
      <input
        id="{id}-swing"
        type="range"
        min="0"
        max="75"
        step="1"
        value={swingPercent}
        aria-valuetext="{swingPercent} %"
        oninput={(event) => app.setSwing(event.currentTarget.valueAsNumber / 100)}
      />
      <span class="swing-value" aria-hidden="true">{swingPercent} %</span>
    </div>
  </div>

  <div class="field">
    <label for="{id}-slot">Slot value</label>
    <select
      id="{id}-slot"
      value={String(app.song.slotValue)}
      onchange={(event) => selectSlotValue(event.currentTarget.value)}
    >
      {#each SLOT_VALUES as slotValue (slotValue)}
        <option value={String(slotValue)}>1/{slotValue}</option>
      {/each}
    </select>
  </div>
</section>

<style>
  .transport {
    display: flex;
    flex-wrap: wrap;
    align-items: flex-end;
    gap: 12px;
    margin: 12px 0 16px;
  }

  .play,
  input,
  select {
    min-height: 44px;
    border-radius: 8px;
    /* 16 px keeps iOS Safari from zooming into a focused field. */
    font: inherit;
    font-size: 16px;
  }

  .play {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    min-width: 96px;
    padding: 0 16px;
    border: none;
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
  }

  .play[aria-pressed='true'] {
    background: var(--fg);
  }

  .play svg {
    fill: currentColor;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  label,
  .label {
    color: var(--muted);
    font-size: 12px;
  }

  /* Segmented control: real radio inputs (keyboard arrows, screen readers), drawn as three joined buttons. */
  .speed {
    display: flex;
    min-height: 44px;
    border: 1px solid color-mix(in srgb, var(--fg) 25%, var(--bg));
    border-radius: 8px;
    overflow: hidden;
  }

  .seg {
    position: relative;
    display: flex;
  }

  .seg input {
    position: absolute;
    opacity: 0;
    min-height: 0;
    width: 100%;
    height: 100%;
    margin: 0;
    cursor: pointer;
  }

  .seg span {
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 44px;
    padding: 0 8px;
    background: color-mix(in srgb, var(--fg) 8%, var(--bg));
    color: var(--fg);
    font-size: 16px;
  }

  .seg + .seg span {
    border-left: 1px solid color-mix(in srgb, var(--fg) 25%, var(--bg));
  }

  .seg input:checked + span {
    background: var(--accent);
    color: var(--bg);
    font-weight: 600;
  }

  .seg input:focus-visible + span {
    outline: 2px solid var(--fg);
    outline-offset: -3px;
  }

  input,
  select {
    padding: 0 10px;
    border: 1px solid color-mix(in srgb, var(--fg) 25%, var(--bg));
    background: color-mix(in srgb, var(--fg) 8%, var(--bg));
    color: var(--fg);
  }

  .bpm {
    width: 5.5em;
  }

  .swing {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 44px;
  }

  /* The input keeps the shared 44 px min-height, so its whole box (not only the thin track) takes the pointer. */
  .swing input {
    width: 112px;
    margin: 0;
    padding: 0;
    border: none;
    background: transparent;
    accent-color: var(--accent);
    cursor: pointer;
  }

  .swing-value {
    min-width: 3.2em;
    color: var(--fg);
    font-size: 14px;
    font-variant-numeric: tabular-nums;
  }

  /* Safari ignores the height of a natively styled select; draw our own arrow instead. */
  select {
    appearance: none;
    padding-right: 28px;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%238a8aa0' stroke-width='1.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
  }
</style>
