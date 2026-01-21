<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { Timeframe } from '@oss-charts/core';
  import { TIMEFRAMES } from '@oss-charts/core';
  import {
    indicatorRegistry,
    type IndicatorInstance,
    type IndicatorType,
  } from '@oss-charts/indicators';
  import type { Drawing, DrawingType } from '$lib/types/drawing';
  import { fetchSymbols } from '$lib/api';
  import ChartViewport from '$lib/components/ChartViewport.svelte';
  import { toLocalInputValue } from '$lib/chart-helpers';

  const sources = ['close', 'open', 'high', 'low'] as const;

  // Chart State Definition
  interface ChartState {
    id: string;
    symbol: string;
    timeframe: Timeframe;
    indicators: IndicatorInstance[];
    drawings: Drawing[];
  }

  type LayoutType = 'single' | '1-2' | '2-1' | '2-2' | '1-3' | '3-1';

  // --- STATE ---
  let layout: LayoutType = 'single';
  let charts: ChartState[] = [];
  let activeChartId = '';
  let syncSymbol = false;

  let availableSymbols: string[] = ['SPY'];
  let loadingSymbols = false;

  // Global UI State
  let showIndicators = false;
  let selectedIndicator: IndicatorType = 'sma';
  let showPresets = false;
  let presetName = '';
  let savedPresets: { name: string; indicators: IndicatorInstance[] }[] = [];
  let isFullscreen = false;
  let crosshairSnap = true;
  let activeTool: DrawingType | null = null;

  // Crosshair Mode Reference (loaded dynamically)
  let crosshairModeRef: typeof import('lightweight-charts').CrosshairMode | null = null;
  let lwc: typeof import('lightweight-charts') | null = null;

  // Active chart getters for toolbar binding
  $: activeChart = charts.find((c) => c.id === activeChartId) || charts[0];
  $: activeSymbol = activeChart?.symbol || 'SPY';
  $: activeTimeframe = activeChart?.timeframe || '5m';

  // --- STORAGE KEYS ---
  const STORAGE_KEY = 'oss-charts-state-v2';
  const PRESETS_KEY = 'oss-charts-presets';

  // --- INITIALIZATION ---
  function createId() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `id-${Math.random().toString(36).slice(2, 9)}`;
  }

  function createChartState(symbol = 'SPY'): ChartState {
    return {
      id: createId(),
      symbol,
      timeframe: '5m',
      indicators: [
        { id: createId(), type: 'sma', params: { length: 20, source: 'close' } },
        { id: createId(), type: 'rsi', params: { length: 14, source: 'close' } },
        { id: createId(), type: 'rsi', params: { length: 14, source: 'close' } },
      ],
      drawings: [],
    };
  }

  function loadState() {
    try {
      // Try parsing URL first
      const url = new URL(window.location.href);
      // Simple URL param support for single chart mainly, or we could encode multiple
      // For now, let's just stick to local storage for the multi-layout complexity

      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        // Default startup
        charts = [createChartState()];
        activeChartId = charts[0].id;
        return;
      }

      const parsed = JSON.parse(raw);
      // Migration or Simple check
      if (parsed.charts && Array.isArray(parsed.charts)) {
        charts = parsed.charts.map((c: any) => ({
          ...c,
          drawings: c.drawings || [],
        }));
        layout = parsed.layout || 'single';
        activeChartId = parsed.activeChartId || charts[0]?.id;
        syncSymbol = parsed.syncSymbol ?? false;
      } else {
        // Old format migration
        charts = [
          {
            id: createId(),
            symbol: parsed.symbol || 'SPY',
            timeframe: parsed.timeframe || '5m',
            indicators: parsed.indicators || [],
            drawings: parsed.drawings || [],
          },
        ];
        activeChartId = charts[0].id;
      }

      // Validate active ID
      if (!charts.find((c) => c.id === activeChartId)) {
        activeChartId = charts[0]?.id;
      }
    } catch (err) {
      console.warn('Failed to load state', err);
      charts = [createChartState()];
      activeChartId = charts[0].id;
    }
  }

  function saveState() {
    const stateToSave = {
      layout,
      charts,
      activeChartId,
      syncSymbol,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stateToSave));
  }

  function updateChartsForLayout(newLayout: LayoutType) {
    const countMap: Record<LayoutType, number> = {
      single: 1,
      '1-2': 2, // 1 top, 2 bottom? or just 2 charts total? Let's assume 2 chars split
      '2-1': 2,
      '2-2': 4,
      '1-3': 4,
      '3-1': 4,
    };
    // Actually, looking at the screenshot:
    // Row 2: 2 cols side-by-side, or 2 rows stacked?
    // Icons show:
    // 1. Single
    // 2. Parallel vertical (2 cols)
    // 3. Parallel horizontal (2 rows)
    // 4. 2 cols, left one split (3 total) - wait, icon 4 is left split?
    // 5. 2 cols, right one split
    // 6. 3 cols?
    // Let's implement a target count based on the layout and fill/trim `charts` array.

    let targetCount = 1;
    switch (newLayout) {
      case 'single':
        targetCount = 1;
        break;
      case '1-2':
        targetCount = 2;
        break; // 2 columns
      case '2-1':
        targetCount = 2;
        break; // 2 rows
      // For the 3-chart layouts (split one side)
      case '1-3':
        targetCount = 3;
        break;
      case '3-1':
        targetCount = 3;
        break;
      // 2x2 grid
      case '2-2':
        targetCount = 4;
        break;
    }

    if (charts.length < targetCount) {
      const needed = targetCount - charts.length;
      const base = activeChart || charts[charts.length - 1]; // copying from active or last
      for (let i = 0; i < needed; i++) {
        charts = [
          ...charts,
          {
            ...JSON.parse(JSON.stringify(base)), // deep copy
            id: createId(),
          },
        ];
      }
    } else if (charts.length > targetCount) {
      charts = charts.slice(0, targetCount);
      if (!charts.find((c) => c.id === activeChartId)) {
        activeChartId = charts[0].id;
      }
    }
    saveState();
  }

  // --- ACTIONS ---

  function setActiveChart(id: string) {
    activeChartId = id;
    saveState();
  }

  function setSymbol(next: string) {
    if (syncSymbol) {
      // Update ALL charts
      charts = charts.map((c) => ({ ...c, symbol: next }));
    } else {
      // Update active only
      charts = charts.map((c) => (c.id === activeChartId ? { ...c, symbol: next } : c));
    }
    saveState();
  }

  function setTimeframe(next: Timeframe) {
    // Timeframe is always per-chart unless we add a specific sync toggle for it.
    // For now, let's keep it per-chart based on typical use (daily vs hourly side by side).
    charts = charts.map((c) => (c.id === activeChartId ? { ...c, timeframe: next } : c));
    saveState();
  }

  function setLayout(next: LayoutType) {
    layout = next;
    updateChartsForLayout(next);
  }

  // Indicator handling - always applies to ACTIVE chart
  function addIndicator() {
    if (!activeChartId) return;
    const def = indicatorRegistry[selectedIndicator];
    const newInd = {
      id: createId(),
      type: def.type,
      params: { ...def.defaultParams },
    };

    charts = charts.map((c) =>
      c.id === activeChartId
        ? {
            ...c,
            indicators: [...c.indicators, newInd],
          }
        : c,
    );
    saveState();
  }

  function removeIndicator(indId: string) {
    charts = charts.map((c) =>
      c.id === activeChartId
        ? {
            ...c,
            indicators: c.indicators.filter((i) => i.id !== indId),
          }
        : c,
    );
    saveState();
  }

  function updateIndicator(indId: string, updater: (cur: IndicatorInstance) => IndicatorInstance) {
    charts = charts.map((c) =>
      c.id === activeChartId
        ? {
            ...c,
            indicators: c.indicators.map((i) => (i.id === indId ? updater(i) : i)),
          }
        : c,
    );
    saveState();
  }

  function handleSourceUpdate(indId: string, e: Event) {
    const target = e.currentTarget as HTMLSelectElement;
    updateIndicator(indId, (c) => ({
      ...c,
      params: { ...c.params, source: target.value as any },
    }));
  }

  // --- PRESETS ---
  function loadPresets() {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) savedPresets = JSON.parse(raw);
    } catch {
      savedPresets = [];
    }
  }

  function savePresets() {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(savedPresets));
  }

  function saveCurrentAsPreset() {
    if (!presetName.trim() || !activeChart) return;
    const existing = savedPresets.findIndex((p) => p.name === presetName.trim());
    const preset = {
      name: presetName.trim(),
      indicators: JSON.parse(JSON.stringify(activeChart.indicators)).map((i: any) => ({
        ...i,
        id: createId(),
      })),
    };

    if (existing >= 0) savedPresets[existing] = preset;
    else savedPresets = [...savedPresets, preset];

    savePresets();
    presetName = '';
    showPresets = false;
  }

  function applyPreset(preset: { name: string; indicators: IndicatorInstance[] }) {
    if (!activeChartId) return;
    // Deep copy indicators with new IDs
    const newInds = preset.indicators.map((i) => ({
      ...i,
      id: createId(),
      params: { ...i.params },
    }));

    charts = charts.map((c) => (c.id === activeChartId ? { ...c, indicators: newInds } : c));
    saveState();
    showPresets = false;
  }

  function deletePreset(name: string) {
    savedPresets = savedPresets.filter((p) => p.name !== name);
    savePresets();
  }

  // --- COMPONENT LIFECYCLE ---
  onMount(async () => {
    // Dynamically import LWC for prop passing
    lwc = await import('lightweight-charts');
    crosshairModeRef = lwc.CrosshairMode;

    loadState();
    loadPresets();
    fetchSymbols().then((syms) => (availableSymbols = syms));

    // Ensure at least one chart
    if (charts.length === 0) {
      charts = [createChartState()];
      activeChartId = charts[0].id;
    }
  });

  // --- HELPERS ---
  // Anchor picking proxy
  let chartViewports: Record<string, ChartViewport> = {}; // Bound refs if needed, or just use event dispatching

  function handleAnchorPick(event: CustomEvent<{ id: string; timestampMs: number }>) {
    // Logic for Anchor VWAP or similar
    const { id: indicatorId, timestampMs } = event.detail;
    // We need to find which chart has this indicator.
    // Actually the event comes from the active chart usually.
    updateIndicator(indicatorId, (cur) => ({
      ...cur,
      params: { ...cur.params, anchorIso: toLocalInputValue(timestampMs) },
    }));
  }

  function triggerAnchorPick(indicatorId: string) {
    // Find the ref for active chart and call method?
    // Svelte bind:this inside each might be tricky with dynamic array.
    // Alternative: Just set a global "picking" state?
    // Actually ChartViewport needs to know.
    // Let's rely on ChartViewport instance methods.
    // We'll bind the components in the #each loop.
  }

  // We need a map of component instances to call methods on them
  let viewportInstances = new Map<string, ChartViewport>();

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    if (isFullscreen) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  function handleDrawingCreate(chartId: string, drawing: Drawing) {
    charts = charts.map((c) =>
      c.id === chartId ? { ...c, drawings: [...c.drawings, drawing] } : c,
    );
    saveState();
  }

  function handleDrawingDelete(chartId: string, drawingId: string) {
    charts = charts.map((c) =>
      c.id === chartId ? { ...c, drawings: c.drawings.filter((d) => d.id !== drawingId) } : c,
    );
    saveState();
  }
</script>

<svelte:head>
  <title>OpenCharts</title>
</svelte:head>

<div class="app">
  <!-- TOPBAR -->
  <header class="topbar">
    <div class="topbar-left">
      <div class="brand">
        <span class="logo">OpenCharts</span>
        <input
          class="symbol-input"
          type="text"
          value={activeSymbol}
          on:change={(e) => setSymbol(e.currentTarget.value)}
          list="symbol-suggestions"
        />
        <datalist id="symbol-suggestions">
          {#each availableSymbols as sym}
            <option value={sym} />
          {/each}
        </datalist>

        <label class="sync-toggle" title="Sync Symbol Across All Charts">
          <input type="checkbox" bind:checked={syncSymbol} on:change={saveState} />
          <span class="sync-icon">🔄</span>
        </label>
      </div>

      <div class="timeframes">
        {#each TIMEFRAMES as tf}
          <button class:selected={tf === activeTimeframe} on:click={() => setTimeframe(tf)}>
            {tf.toUpperCase()}
          </button>
        {/each}
      </div>
    </div>

    <!-- LAYOUT SELECTOR -->
    <div class="layout-selector">
      <button
        class:active={layout === 'single'}
        on:click={() => setLayout('single')}
        title="Single View"
      >
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
          ><rect
            x="1"
            y="1"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
          /></svg
        >
      </button>
      <button class:active={layout === '1-2'} on:click={() => setLayout('1-2')} title="2 Columns">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
          ><rect
            x="1"
            y="1"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
          /><line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1.5" /></svg
        >
      </button>
      <button class:active={layout === '2-1'} on:click={() => setLayout('2-1')} title="2 Rows">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
          ><rect
            x="1"
            y="1"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
          /><line x1="1" y1="8" x2="15" y2="8" stroke="currentColor" stroke-width="1.5" /></svg
        >
      </button>
      <button class:active={layout === '2-2'} on:click={() => setLayout('2-2')} title="4 Grid">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor"
          ><rect
            x="1"
            y="1"
            width="14"
            height="14"
            rx="2"
            stroke="currentColor"
            stroke-width="1.5"
            fill="none"
          /><line x1="8" y1="1" x2="8" y2="15" stroke="currentColor" stroke-width="1.5" /><line
            x1="1"
            y1="8"
            x2="15"
            y2="8"
            stroke="currentColor"
            stroke-width="1.5"
          /></svg
        >
      </button>
    </div>

    <div class="topbar-right">
      <!-- INDICATORS & PRESETS -->
      <div class="presets-menu">
        <button class="toolbar-btn" on:click={() => (showPresets = !showPresets)}> Presets </button>
        {#if showPresets}
          <div class="panel presets-panel">
            <div class="panel-header">Indicator Presets</div>
            <div class="panel-row">
              <input
                type="text"
                bind:value={presetName}
                placeholder="Preset name"
                class="preset-input"
              />
              <button class="add" on:click={saveCurrentAsPreset}>Save</button>
            </div>
            {#if savedPresets.length === 0}<p class="empty">No saved presets.</p>{/if}
            {#each savedPresets as preset}
              <div class="preset-item">
                <button class="preset-load" on:click={() => applyPreset(preset)}>
                  {preset.name}
                  <span class="preset-count">({preset.indicators.length} active)</span>
                </button>
                <button class="remove" on:click={() => deletePreset(preset.name)}>Delete</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="indicator-menu">
        <button class="indicator-toggle" on:click={() => (showIndicators = !showIndicators)}>
          Indicators {activeChart?.indicators.length ? `(${activeChart.indicators.length})` : ''}
        </button>
        {#if showIndicators && activeChart}
          <div class="panel indicator-panel">
            <div class="panel-header">Active Chart Indicators</div>
            <div class="panel-row">
              <select bind:value={selectedIndicator}>
                {#each Object.values(indicatorRegistry) as indicator}
                  <option value={indicator.type}>{indicator.name}</option>
                {/each}
              </select>
              <button class="add" on:click={addIndicator}>Add</button>
            </div>
            {#each activeChart.indicators as indicator (indicator.id)}
              <div class="indicator">
                <div class="indicator-header">
                  <span>{indicatorRegistry[indicator.type].name}</span>
                  <button class="remove" on:click={() => removeIndicator(indicator.id)}
                    >Remove</button
                  >
                </div>
                <div class="indicator-body">
                  <!-- Simplified param inputs -->
                  {#if indicator.type !== 'vwap'}
                    <label
                      >Length <input
                        type="number"
                        min="1"
                        value={indicator.params.length}
                        on:change={(e) =>
                          updateIndicator(indicator.id, (c) => ({
                            ...c,
                            params: { ...c.params, length: +e.currentTarget.value },
                          }))}
                      /></label
                    >
                    <label
                      >Source
                      <select
                        value={indicator.params.source}
                        on:change={(e) => handleSourceUpdate(indicator.id, e)}
                      >
                        {#each sources as s}<option value={s}>{s}</option>{/each}
                      </select>
                    </label>
                  {:else}
                    <label
                      >Anchor <input
                        type="datetime-local"
                        value={indicator.params.anchorIso}
                        on:change={(e) =>
                          updateIndicator(indicator.id, (c) => ({
                            ...c,
                            params: { ...c.params, anchorIso: e.currentTarget.value },
                          }))}
                      /></label
                    >
                    <button
                      class="anchor-btn"
                      on:click={() =>
                        viewportInstances.get(activeChartId)?.beginAnchorPick(indicator.id)}
                    >
                      Pick on Chart
                    </button>
                  {/if}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <label class="crosshair-toggle">
        <input type="checkbox" bind:checked={crosshairSnap} />
        <span>Snap</span>
      </label>

      <button class="toolbar-btn" on:click={toggleFullscreen}>
        {isFullscreen ? 'Exit' : 'Full'}
      </button>

      <!-- DRAWING TOOLS -->
      <div class="drawing-tools">
        <button class:active={!activeTool} on:click={() => (activeTool = null)} title="Cursor">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <path
              d="M14.0828 9.50279L21.3579 16.7779L16.7779 21.3579L9.50279 14.0828L3.25 20.3356V3.25L20.3356 9.50279L14.0828 9.50279Z"
            />
          </svg>
        </button>
        <button
          class:active={activeTool === 'trendline'}
          on:click={() => (activeTool = 'trendline')}
          title="Trendline"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="4" y1="20" x2="20" y2="4" />
            <circle cx="4" cy="20" r="2" fill="currentColor" />
            <circle cx="20" cy="4" r="2" fill="currentColor" />
          </svg>
        </button>
        <button
          class:active={activeTool === 'horizontal_line'}
          on:click={() => (activeTool = 'horizontal_line')}
          title="Horizontal Line"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="3" y1="12" x2="21" y2="12" />
          </svg>
        </button>
        <button
          class:active={activeTool === 'fibonacci'}
          on:click={() => (activeTool = 'fibonacci')}
          title="Fibonacci"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
          >
            <line x1="4" y1="20" x2="20" y2="4" stroke-dasharray="2 2" opacity="0.5" />
            <line x1="4" y1="20" x2="10" y2="20" />
            <line x1="14" y1="10" x2="20" y2="10" />
            <line x1="14" y1="4" x2="20" y2="4" />
          </svg>
        </button>
      </div>
    </div>
  </header>

  <!-- MAIN GRID LAYOUT -->
  <main class="layout" data-layout={layout}>
    {#each charts as chart (chart.id)}
      <ChartViewport
        bind:this={viewportInstances[chart.id]}
        id={chart.id}
        symbol={chart.symbol}
        timeframe={chart.timeframe}
        indicators={chart.indicators}
        isActive={activeChartId === chart.id}
        {crosshairSnap}
        activeTool={activeChartId === chart.id ? activeTool : null}
        drawings={chart.drawings}
        on:activate={() => setActiveChart(chart.id)}
        on:pickAnchor={handleAnchorPick}
        on:create={(e) => handleDrawingCreate(chart.id, e.detail)}
        on:delete={(e) => handleDrawingDelete(chart.id, e.detail)}
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
  :global(body) {
    margin: 0;
    font-family: 'Space Grotesk', sans-serif;
    background: radial-gradient(circle at top, #1e293b 0%, #0f172a 45%, #020617 100%);
    color: #e2e8f0;
    min-height: 100vh;
  }

  .app {
    display: flex;
    flex-direction: column;
    min-height: 100vh;
  }

  /* TOPBAR LAYOUT */
  .topbar {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 12px 24px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(8px);
    z-index: 10;
  }

  .topbar-left,
  .topbar-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .topbar-right {
    margin-left: auto;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .logo {
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    font-size: 16px;
  }

  .symbol-input {
    padding: 6px 12px;
    border-radius: 8px;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.35);
    color: #e2e8f0;
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
    display: none;
  }
  .sync-icon {
    font-size: 16px;
  }
  .sync-toggle:has(input:checked) .sync-icon {
    color: #5eead4;
    text-shadow: 0 0 10px rgba(94, 234, 212, 0.5);
  }

  .timeframes {
    display: flex;
    gap: 4px;
  }
  .timeframes button {
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: transparent;
    color: #94a3b8;
    padding: 4px 8px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 12px;
    font-weight: 500;
  }
  .timeframes button.selected {
    background: rgba(94, 234, 212, 0.15);
    border-color: rgba(94, 234, 212, 0.6);
    color: #e2e8f0;
  }

  /* LAYOUT SELECTOR */
  .layout-selector {
    display: flex;
    gap: 4px;
    margin-left: 20px;
    padding-left: 20px;
    border-left: 1px solid rgba(148, 163, 184, 0.2);
  }
  .layout-selector button {
    background: transparent;
    border: 1px solid transparent;
    color: #64748b;
    padding: 6px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .layout-selector button:hover {
    background: rgba(148, 163, 184, 0.1);
    color: #94a3b8;
  }
  .layout-selector button.active {
    background: rgba(148, 163, 184, 0.2);
    color: #e2e8f0;
  }

  /* GRID SYSTEM */
  .layout {
    display: grid;
    gap: 16px;
    padding: 16px;
    flex: 1;
    overflow: hidden;
  }
  /* Single */
  .layout[data-layout='single'] {
    grid-template-columns: 1fr;
  }
  /* 2 Cols */
  .layout[data-layout='1-2'] {
    grid-template-columns: 1fr 1fr;
  }
  /* 2 Rows */
  .layout[data-layout='2-1'] {
    grid-template-rows: 1fr 1fr;
  }
  /* 4 Grid (2x2) */
  .layout[data-layout='2-2'] {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  /* 1 Left, 2 Right (Split) - Implementation for 3 charts often needs specific CSS grid or fallback */
  .layout[data-layout='1-3'] {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  /* For 1-3, we'd want first chart to span 2 rows if it's "1 Left". 
     But let's keep it simple: 3 items in a 2x2 grid leaves one empty space.
     To make one big, we need :nth-child logic. 
  */
  .layout[data-layout='1-3'] > :first-child {
    grid-row: span 2;
  }

  .layout[data-layout='3-1'] {
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr 1fr;
  }
  /* For 3-1 (Right Split?), maybe Last child spans? Or generic grid logic. */

  /* MENUS & DIALOGS (Copied/Simplified from original) */
  .indicator-menu,
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
    background: rgba(2, 6, 23, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.35);
    border-radius: 12px;
    padding: 16px;
    z-index: 50;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  }

  .panel-header {
    font-weight: 600;
    text-transform: uppercase;
    font-size: 12px;
    margin-bottom: 12px;
    color: #94a3b8;
  }

  .panel-row {
    display: flex;
    gap: 8px;
    margin-bottom: 12px;
  }
  .panel-row select,
  .panel-row input {
    flex: 1;
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(148, 163, 184, 0.3);
    padding: 6px;
    border-radius: 6px;
    color: white;
  }
  .add {
    background: rgba(94, 234, 212, 0.2);
    color: #5eead4;
    border: 1px solid rgba(94, 234, 212, 0.5);
    border-radius: 6px;
    padding: 0 12px;
    cursor: pointer;
  }

  .indicator {
    background: rgba(255, 255, 255, 0.03);
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 8px;
  }
  .indicator-header {
    display: flex;
    justify-content: space-between;
    font-size: 13px;
    font-weight: 500;
    margin-bottom: 8px;
  }
  .remove {
    color: #fca5a5;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 11px;
  }

  .indicator-body {
    display: grid;
    gap: 8px;
  }
  .indicator-body label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 11px;
    color: #94a3b8;
  }
  .indicator-body input,
  .indicator-body select {
    width: 60px;
    padding: 2px 4px;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: white;
    border-radius: 4px;
  }

  .toolbar-btn,
  .indicator-toggle,
  .crosshair-toggle {
    border: 1px solid rgba(148, 163, 184, 0.3);
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
    background: transparent;
    color: #e2e8f0;
  }
  .crosshair-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .crosshair-toggle input {
    accent-color: #5eead4;
  }

  .footer {
    margin-top: auto;
    padding: 12px 24px;
    font-size: 11px;
    opacity: 0.6;
    text-align: center;
  }
  .footer a {
    color: #38bdf8;
  }

  @media (max-width: 768px) {
    .topbar {
      flex-wrap: wrap;
      gap: 12px;
    }
    .layout-selector {
      display: none; /* Hide complex layouts on mobile? or wrap */
    }
    .layout {
      grid-template-columns: 1fr !important;
      grid-template-rows: auto !important;
    }
  }

  .drawing-tools {
    display: flex;
    gap: 4px;
    margin-left: 16px;
    padding-left: 16px;
    border-left: 1px solid rgba(148, 163, 184, 0.2);
  }

  .drawing-tools button {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    cursor: pointer;
    transition: all 0.2s;
  }

  .drawing-tools button:hover {
    background: rgba(148, 163, 184, 0.1);
    color: #e2e8f0;
  }

  .drawing-tools button.active {
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.3);
  }
</style>
