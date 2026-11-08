<script lang="ts">
  import type { PriceSource } from '@oss-charts/core';
  import {
    indicatorRegistry,
    type IndicatorType,
  } from '@oss-charts/indicators';
  import { chartStore, PRICE_SOURCES } from '$lib/state/charts.svelte';

  interface Props {
    open?: boolean;
    beginAnchorPick: (indicatorId: string) => void;
  }

  let { open = $bindable(false), beginAnchorPick }: Props = $props();

  let selectedIndicator: IndicatorType = $state('sma');

  const activeChart = $derived(chartStore.activeChart);

  function handleSourceUpdate(indicatorId: string, e: Event) {
    const source = (e.currentTarget as HTMLSelectElement).value as PriceSource;
    chartStore.updateIndicator(indicatorId, (indicator) => ({
      ...indicator,
      params: { ...indicator.params, source },
    }));
  }
</script>

<div class="indicator-menu">
  <button
    class="toolbar-btn"
    onclick={() => (open = !open)}
    aria-expanded={open}
    aria-haspopup="true"
  >
    Indicators {activeChart?.indicators.length ? `(${activeChart.indicators.length})` : ''}
  </button>
  {#if open && activeChart}
    <div class="panel" role="dialog" aria-label="Chart indicators">
      <div class="panel-header">Active Chart Indicators</div>
      <div class="panel-row">
        <select bind:value={selectedIndicator} aria-label="Indicator type">
          {#each Object.values(indicatorRegistry) as indicator (indicator.type)}
            <option value={indicator.type}>{indicator.name}</option>
          {/each}
        </select>
        <button class="add" onclick={() => chartStore.addIndicator(selectedIndicator)}>Add</button>
      </div>
      {#if activeChart.indicators.length === 0}
        <p class="empty">No indicators on this chart.</p>
      {/if}
      {#each activeChart.indicators as indicator (indicator.id)}
        <div class="indicator">
          <div class="indicator-header">
            <span>{indicatorRegistry[indicator.type].name}</span>
            <button class="remove" onclick={() => chartStore.removeIndicator(indicator.id)}>
              Remove
            </button>
          </div>
          <div class="indicator-body">
            {#if indicator.type !== 'vwap'}
              <label>
                Length
                <input
                  type="number"
                  min="1"
                  value={indicator.params.length}
                  onchange={(e) =>
                    chartStore.updateIndicator(indicator.id, (c) => ({
                      ...c,
                      params: { ...c.params, length: +e.currentTarget.value },
                    }))}
                />
              </label>
              <label>
                Source
                <select value={indicator.params.source} onchange={(e) => handleSourceUpdate(indicator.id, e)}>
                  {#each PRICE_SOURCES as s (s)}<option value={s}>{s}</option>{/each}
                </select>
              </label>
            {:else}
              <label>
                Anchor
                <input
                  type="datetime-local"
                  value={indicator.params.anchorIso}
                  onchange={(e) =>
                    chartStore.updateIndicator(indicator.id, (c) => ({
                      ...c,
                      params: { ...c.params, anchorIso: e.currentTarget.value },
                    }))}
                />
              </label>
              <button class="anchor-btn" onclick={() => beginAnchorPick(indicator.id)}>
                Pick on Chart
              </button>
            {/if}
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .indicator-menu {
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
  .panel-row select {
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

  .indicator {
    background: var(--surface-inset);
    border-radius: var(--radius-lg);
    padding: 10px;
    margin-bottom: var(--space-2);
  }
  .indicator-header {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: var(--space-2);
  }
  .remove {
    color: var(--danger-text);
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
  }

  .indicator-body {
    display: grid;
    gap: var(--space-2);
  }
  .indicator-body label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: var(--text-secondary);
  }
  .indicator-body input,
  .indicator-body select {
    width: 60px;
    padding: 2px var(--space-1);
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: var(--text-primary);
    border-radius: var(--radius-sm);
  }
  .anchor-btn {
    background: var(--accent-soft);
    color: var(--accent);
    border: 1px solid var(--accent-border);
    border-radius: var(--radius-md);
    padding: var(--space-1) var(--space-2);
    font-size: 11px;
    cursor: pointer;
  }
</style>
