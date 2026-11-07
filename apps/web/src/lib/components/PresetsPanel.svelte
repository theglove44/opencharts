<script lang="ts">
  import { chartStore } from '$lib/state/charts.svelte';

  interface Props {
    open?: boolean;
  }

  let { open = $bindable(false) }: Props = $props();

  let presetName = $state('');

  function saveCurrentAsPreset() {
    chartStore.saveCurrentAsPreset(presetName);
    presetName = '';
    open = false;
  }

  function applyPreset(name: string) {
    const preset = chartStore.savedPresets.find((p) => p.name === name);
    if (!preset) return;
    chartStore.applyPreset(preset);
    open = false;
  }
</script>

<div class="presets-menu">
  <button
    class="toolbar-btn"
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-haspopup="true"
  >
    Presets
  </button>
  {#if open}
    <div class="panel" role="dialog" aria-label="Indicator presets">
      <div class="panel-header">Indicator Presets</div>
      <div class="panel-row">
        <input
          type="text"
          bind:value={presetName}
          placeholder="Preset name"
          class="preset-input"
          onkeydown={(e) => e.key === 'Enter' && saveCurrentAsPreset()}
        />
        <button class="add" onclick={saveCurrentAsPreset}>Save</button>
      </div>
      {#if chartStore.savedPresets.length === 0}<p class="empty">No saved presets.</p>{/if}
      {#each chartStore.savedPresets as preset (preset.name)}
        <div class="preset-item">
          <button class="preset-load" onclick={() => applyPreset(preset.name)}>
            {preset.name}
            <span class="preset-count">({preset.indicators.length} active)</span>
          </button>
          <button class="remove" onclick={() => chartStore.deletePreset(preset.name)}>Delete</button>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .presets-menu {
    position: relative;
  }

  .panel {
    position: absolute;
    right: 0;
    top: calc(100% + 10px);
    width: 300px;
    max-height: 70vh;
    overflow-y: auto;
    background: var(--surface-panel);
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-xl);
    padding: var(--space-4);
    z-index: 50;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  }

  .panel-header {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 12px;
    margin-bottom: var(--space-3);
    color: var(--text-secondary);
  }

  .panel-row {
    display: flex;
    gap: var(--space-2);
    margin-bottom: var(--space-3);
  }
  .panel-row input {
    flex: 1;
    background: var(--surface-field);
    border: 1px solid var(--border-default);
    padding: var(--space-2);
    border-radius: var(--radius-md);
    color: var(--text-primary);
  }
  .add {
    background: var(--teal-soft);
    color: var(--teal);
    border: 1px solid var(--teal-border);
    border-radius: var(--radius-md);
    padding: 0 var(--space-3);
    cursor: pointer;
  }

  .empty {
    font-size: 12px;
    color: var(--text-secondary);
    opacity: 0.7;
    margin: 0 0 var(--space-2);
  }

  .preset-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
    padding: var(--space-2);
    border-radius: var(--radius-lg);
    background: var(--surface-inset);
    margin-bottom: var(--space-2);
  }
  .preset-load {
    flex: 1;
    text-align: left;
    background: none;
    border: none;
    color: var(--text-primary);
    font-size: 13px;
    cursor: pointer;
  }
  .preset-count {
    color: var(--text-secondary);
    font-size: 11px;
  }
  .remove {
    color: var(--danger-text);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
  }
</style>
