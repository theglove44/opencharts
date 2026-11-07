<script lang="ts">
  import { TIMEFRAMES } from '@oss-charts/core';
  import { chartStore } from '$lib/state/charts.svelte';
  import type { DrawingType } from '$lib/types/drawing';
  import LayoutSelector from './LayoutSelector.svelte';
  import DrawingTools from './DrawingTools.svelte';
  import IndicatorPanel from './IndicatorPanel.svelte';
  import PresetsPanel from './PresetsPanel.svelte';

  interface Props {
    availableSymbols?: string[];
    activeTool?: DrawingType | null;
    crosshairSnap?: boolean;
    isFullscreen?: boolean;
    ontogglefullscreen: () => void;
    beginAnchorPick: (indicatorId: string) => void;
  }

  let {
    availableSymbols = ['SPY'],
    activeTool = $bindable(null),
    crosshairSnap = $bindable(true),
    isFullscreen = $bindable(false),
    ontogglefullscreen,
    beginAnchorPick,
  }: Props = $props();

  let showIndicators = $state(false);
  let showPresets = $state(false);

  let indicatorMenuEl: HTMLDivElement | undefined = $state();
  let presetsMenuEl: HTMLDivElement | undefined = $state();

  const activeSymbol = $derived(chartStore.activeSymbol);
  const activeTimeframe = $derived(chartStore.activeTimeframe);

  function handleWindowClick(e: MouseEvent) {
    const target = e.target as Node;
    if (showIndicators && indicatorMenuEl && !indicatorMenuEl.contains(target)) {
      showIndicators = false;
    }
    if (showPresets && presetsMenuEl && !presetsMenuEl.contains(target)) {
      showPresets = false;
    }
  }

  function handleEscape(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (showIndicators || showPresets) {
      showIndicators = false;
      showPresets = false;
      e.stopPropagation();
    }
  }
</script>

<svelte:window onclick={handleWindowClick} onkeydown={handleEscape} />

<header class="topbar">
  <div class="topbar-left">
    <div class="brand">
      <span class="logo">OpenCharts</span>
      <input
        class="symbol-input"
        type="text"
        value={activeSymbol}
        onchange={(e) => chartStore.setSymbol(e.currentTarget.value)}
        list="symbol-suggestions"
        aria-label="Symbol"
        spellcheck="false"
      />
      <datalist id="symbol-suggestions">
        {#each availableSymbols as sym (sym)}
          <option value={sym}></option>
        {/each}
      </datalist>

      <label class="sync-toggle" title="Sync Symbol Across All Charts">
        <input
          type="checkbox"
          checked={chartStore.syncSymbol}
          onchange={(e) => chartStore.setSyncSymbol(e.currentTarget.checked)}
        />
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <path d="M17 2l4 4-4 4" />
          <path d="M3 11v-1a4 4 0 0 1 4-4h14" />
          <path d="M7 22l-4-4 4-4" />
          <path d="M21 13v1a4 4 0 0 1-4 4H3" />
        </svg>
        <span class="sr-only">Sync symbol across all charts</span>
      </label>
    </div>

    <div class="timeframes" role="group" aria-label="Timeframe">
      {#each TIMEFRAMES as tf, i (tf)}
        <button
          class:selected={tf === activeTimeframe}
          onclick={() => chartStore.setTimeframe(tf)}
          title="{tf.toUpperCase()} ({i + 1})"
        >
          {tf.toUpperCase()}
        </button>
      {/each}
    </div>
  </div>

  <LayoutSelector />

  <div class="topbar-right">
    <div bind:this={presetsMenuEl}>
      <PresetsPanel bind:open={showPresets} />
    </div>

    <div bind:this={indicatorMenuEl}>
      <IndicatorPanel bind:open={showIndicators} {beginAnchorPick} />
    </div>

    <label class="crosshair-toggle">
      <input type="checkbox" bind:checked={crosshairSnap} />
      <span>Snap</span>
    </label>

    <button class="toolbar-btn" onclick={ontogglefullscreen}>
      {isFullscreen ? 'Exit' : 'Full'}
    </button>

    <DrawingTools bind:tool={activeTool} />
  </div>
</header>

<style>
  .topbar {
    display: flex;
    align-items: center;
    gap: var(--space-4);
    padding: var(--space-3) var(--space-6);
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    background: var(--surface);
    backdrop-filter: blur(8px);
    z-index: 10;
  }

  .topbar-left,
  .topbar-right {
    display: flex;
    align-items: center;
    gap: var(--space-4);
  }

  .topbar-right {
    margin-left: auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: var(--space-3);
  }

  .logo {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 16px;
  }

  .symbol-input {
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--accent-soft);
    border: 1px solid var(--accent-border);
    color: var(--text-primary);
    font-weight: 600;
    width: 80px;
    text-transform: uppercase;
  }
  .symbol-input:focus {
    outline: none;
    border-color: rgba(56, 189, 248, 0.8);
    background: rgba(56, 189, 248, 0.25);
  }

  .sync-toggle {
    display: flex;
    align-items: center;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.2s;
  }
  .sync-toggle:hover,
  .sync-toggle:has(input:checked) {
    opacity: 1;
  }
  .sync-toggle input {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }
  .sync-toggle svg {
    color: var(--text-secondary);
  }
  .sync-toggle:has(input:checked) svg {
    color: var(--teal);
    filter: drop-shadow(0 0 6px rgba(94, 234, 212, 0.5));
  }

  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0 0 0 0);
  }

  .timeframes {
    display: flex;
    gap: var(--space-1);
  }
  .timeframes button {
    border: 1px solid var(--border-default);
    background: transparent;
    color: var(--text-secondary);
    padding: var(--space-1) var(--space-2);
    border-radius: var(--radius-md);
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  .timeframes button.selected {
    background: var(--teal-soft);
    border-color: rgba(94, 234, 212, 0.6);
    color: var(--text-primary);
  }

  .toolbar-btn,
  .crosshair-toggle {
    border: 1px solid var(--border-default);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    cursor: pointer;
    font-size: 12px;
    background: transparent;
    color: var(--text-primary);
  }
  .crosshair-toggle {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }
  .crosshair-toggle input {
    accent-color: var(--teal);
  }

  @media (max-width: 768px) {
    .topbar {
      flex-wrap: wrap;
      gap: var(--space-3);
    }
  }
</style>
