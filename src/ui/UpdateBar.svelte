<script lang="ts">
  let { reload }: { reload: () => void } = $props();
</script>

<!-- Never reloads by itself: that would cut playback and drop the preparation area. -->
<div class="update" role="status">
  <span>New version available</span>
  <button type="button" onclick={reload}>Reload</button>
</div>

<style>
  .update {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin: 0 0 12px;
    padding: 6px 6px 6px 14px;
    border: 1px solid var(--accent);
    border-radius: 10px;
    background: color-mix(in srgb, var(--accent) 12%, var(--bg));
  }

  button {
    min-height: 44px;
    padding: 0 16px;
    border: none;
    border-radius: 8px;
    background: var(--accent);
    color: var(--bg);
    font: inherit;
    font-weight: 600;
    cursor: pointer;
  }
</style>
