<script lang="ts">
  import { onMount } from 'svelte';
  import { TIMEFRAMES } from '@oss-charts/core';
  import { chartStore } from '$lib/state/charts.svelte';
  import { fetchSymbols } from '$lib/api';
  import ChartViewport from '$lib/components/ChartViewport.svelte';
  import Topbar from '$lib/components/Topbar.svelte';
  import type { Drawing, DrawingType } from '$lib/types/drawing';
  import { toLocalInputValue } from '$lib/chart-helpers';

  let availableSymbols = $state(['SPY']);
  let activeTool = $state<DrawingType | null>(null);
  let crosshairSnap = $state(true);
  let isFullscreen = $state(false);

  // Instance registry so the indicator panel can start an anchor pick on the
  // active chart's viewport.
  let viewportInstances: Record<string, ChartViewport> = {};

  function beginAnchorPick(indicatorId: string) {
    const instance = viewportInstances[chartStore.activeChartId];
    instance?.beginAnchorPick(indicatorId);
  }

  onMount(async () => {
    chartStore.init();
    const symbols = await fetchSymbols();
    availableSymbols = symbols;
  });

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    if (isFullscreen) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  function handleAnchorPick(detail: { id: string; timestampMs: number }) {
    chartStore.updateIndicator(detail.id, (indicator) => ({
      ...indicator,
      params: { ...indicator.params, anchorIso: toLocalInputValue(detail.timestampMs) },
    }));
  }

  function handleDrawingCreate(chartId: string, drawing: Drawing) {
    chartStore.addDrawing(chartId, drawing);
  }

  function handleDrawingDelete(chartId: string, drawingId: string) {
    chartStore.removeDrawing(chartId, drawingId);
  }

  function handleKeydown(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null;
    if (
      target &&
      (target.tagName === 'INPUT' ||
        target.tagName === 'SELECT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable)
    ) {
      return;
    }

    if (e.key === 'Escape') {
      activeTool = null;
      if (isFullscreen && !document.fullscreenElement) toggleFullscreen();
      return;
    }

    if (e.key.toLowerCase() === 'f') {
      toggleFullscreen();
      return;
    }

    const index = Number.parseInt(e.key, 10);
    if (index >= 1 && index <= TIMEFRAMES.length) {
      chartStore.setTimeframe(TIMEFRAMES[index - 1]);
    }
  }
</script>

<svelte:head>
  <title>OpenCharts</title>
</svelte:head>

<svelte:window onkeydown={handleKeydown} />

<div class="app">
  <Topbar
    bind:activeTool
    bind:crosshairSnap
    bind:isFullscreen
    ontogglefullscreen={toggleFullscreen}
    beginAnchorPick={beginAnchorPick}
    {availableSymbols}
  />

  <main class="layout" data-layout={chartStore.layout}>
    {#each chartStore.charts as chart (chart.id)}
      <ChartViewport
        bind:this={viewportInstances[chart.id]}
        id={chart.id}
        symbol={chart.symbol}
        timeframe={chart.timeframe}
        indicators={chart.indicators}
        isActive={chartStore.activeChartId === chart.id}
        {crosshairSnap}
        activeTool={chartStore.activeChartId === chart.id ? activeTool : null}
        drawings={chart.drawings}
        onactivate={() => chartStore.setActiveChart(chart.id)}
        onpickanchor={handleAnchorPick}
        oncreate={(drawing) => handleDrawingCreate(chart.id, drawing)}
        ondelete={(drawingId) => handleDrawingDelete(chart.id, drawingId)}
      />
    {/each}
  </main>

  <footer class="footer">
    Charts powered by <a
      href="https://github.com/tradingview/lightweight-charts"
      target="_blank"
      rel="noreferrer">TradingView</a
    >
  </footer>
</div>

<style>
  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  .layout {
    display: grid;
    gap: var(--space-4);
    padding: var(--space-4);
    flex: 1;
    overflow: hidden;
  }

  .layout[data-layout='single'] {
    grid-template-columns: 1fr;
  }
  .layout[data-layout='1-2'] {
    grid-template-columns: 1fr 1fr;
  }
  .layout[data-layout='2-1'] {
    grid-template-rows: 1fr 1fr;
  }
  .layout[data-layout='2-2'] {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .layout[data-layout='1-3'] {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .layout[data-layout='1-3'] > :global(*:first-child) {
    grid-row: span 2;
  }
  .layout[data-layout='3-1'] {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  .layout[data-layout='3-1'] > :global(*:last-child) {
    grid-row: span 2;
  }

  .footer {
    margin-top: auto;
    padding: var(--space-3) var(--space-6);
    font-size: 11px;
    opacity: 0.6;
    text-align: center;
  }
  .footer a {
    color: var(--accent);
  }

  @media (max-width: 768px) {
    .layout {
      grid-template-columns: 1fr !important;
      grid-template-rows: auto !important;
    }
  }
</style>
