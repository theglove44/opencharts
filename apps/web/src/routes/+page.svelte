<script lang="ts">
  import { onMount, tick } from 'svelte';
  import type { IChartApi, ISeriesApi, TimeRange } from 'lightweight-charts';
  import type { Candle, PriceSource, Timeframe } from '@oss-charts/core';
  import { TIMEFRAMES } from '@oss-charts/core';
  import {
    formatTimestamp,
    getLookbackMs,
    getTimeframeMs,
    toCandlestickData,
    toCandlestickPoint,
    toLineData,
    toLocalInputValue
  } from '$lib/chart-helpers';
  import {
    indicatorRegistry,
    type IndicatorDefinition,
    type IndicatorInstance,
    type IndicatorType
  } from '@oss-charts/indicators';
  import { fetchCandles, fetchLatestPrice, fetchSymbols } from '$lib/api';

  const sources: PriceSource[] = ['close', 'open', 'high', 'low'];
  const palette = ['#f97316', '#22c55e', '#0ea5e9', '#eab308', '#ef4444', '#8b5cf6'];

  let chartContainer: HTMLDivElement | null = null;
  let rsiContainer: HTMLDivElement | null = null;

  let chart: IChartApi | null = null;
  let candleSeries: ISeriesApi<'Candlestick'> | null = null;
  let rsiChart: IChartApi | null = null;

  let overlaySeries = new Map<string, ISeriesApi<'Line'>>();
  let rsiSeries = new Map<string, ISeriesApi<'Line'>>();

  let createChartFn: typeof import('lightweight-charts').createChart | null = null;
  let crosshairModeRef: typeof import('lightweight-charts').CrosshairMode | null = null;
  let syncVisibleRange: ((range: TimeRange | null) => void) | null = null;
  let allowRangeSync = false;

  let timeframe: Timeframe = '5m';
  let symbol = 'SPY';
  let availableSymbols: string[] = ['SPY'];
  let indicators: IndicatorInstance[] = [];
  let selectedIndicator: IndicatorType = 'sma';

  let candles: Candle[] = [];
  let loading = false;
  let error = '';
  let crosshair: Candle | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let fullRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshInFlight = false;
  let latestInFlight = false;
  let lastBarUpdatedAt = '';
  let showIndicators = false;
  let crosshairSnap = true;
  let anchorPickId: string | null = null;
  let isFullscreen = false;
  let showPresets = false;
  let presetName = '';
  let savedPresets: { name: string; indicators: IndicatorInstance[] }[] = [];

  const STORAGE_KEY = 'oss-charts-state';
  const PRESETS_KEY = 'oss-charts-presets';
  const TICK_REFRESH_MS = 1_000;
  const BAR_REFRESH_MS = 60_000;

  function loadState() {
    try {
      const url = new URL(window.location.href);
      const urlSymbol = url.searchParams.get('symbol');
      const urlTf = url.searchParams.get('tf');
      const urlIndicators = url.searchParams.get('indicators');

      if (urlSymbol || urlTf || urlIndicators) {
        if (urlSymbol) symbol = urlSymbol;
        if (urlTf && TIMEFRAMES.includes(urlTf as Timeframe)) timeframe = urlTf as Timeframe;
        if (urlIndicators) {
          try {
            const parsed = JSON.parse(decodeURIComponent(urlIndicators));
            if (Array.isArray(parsed)) {
              indicators = parsed.map((ind: IndicatorInstance) => ({
                ...ind,
                id: ind.id || createId()
              }));
            }
          } catch {
            // ignore invalid indicator JSON
          }
        }
        if (indicators.length === 0) {
          indicators = [
            { id: createId(), type: 'sma', params: { length: 20, source: 'close' } },
            { id: createId(), type: 'rsi', params: { length: 14, source: 'close' } }
          ];
        }
        return;
      }

      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        indicators = [
          { id: createId(), type: 'sma', params: { length: 20, source: 'close' } },
          { id: createId(), type: 'rsi', params: { length: 14, source: 'close' } }
        ];
        return;
      }
      const parsed = JSON.parse(raw) as { timeframe: Timeframe; symbol: string; indicators: IndicatorInstance[] };
      timeframe = parsed.timeframe ?? timeframe;
      symbol = parsed.symbol ?? symbol;
      indicators = parsed.indicators ?? indicators;
    } catch (err) {
      console.warn('Failed to load state', err);
    }
  }

  function saveState() {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        timeframe,
        symbol,
        indicators
      })
    );
  }

  function getShareableUrl(): string {
    const url = new URL(window.location.origin + window.location.pathname);
    url.searchParams.set('symbol', symbol);
    url.searchParams.set('tf', timeframe);
    const indicatorsData = indicators.map(({ type, params }) => ({ type, params }));
    url.searchParams.set('indicators', encodeURIComponent(JSON.stringify(indicatorsData)));
    return url.toString();
  }

  async function copyShareUrl() {
    const url = getShareableUrl();
    try {
      await navigator.clipboard.writeText(url);
      alert('Chart URL copied to clipboard!');
    } catch {
      prompt('Copy this URL:', url);
    }
  }

  function loadPresets() {
    try {
      const raw = localStorage.getItem(PRESETS_KEY);
      if (raw) {
        savedPresets = JSON.parse(raw);
      }
    } catch {
      savedPresets = [];
    }
  }

  function savePresets() {
    localStorage.setItem(PRESETS_KEY, JSON.stringify(savedPresets));
  }

  async function saveCurrentAsPreset() {
    if (!presetName.trim()) return;
    const existing = savedPresets.findIndex((p) => p.name === presetName.trim());
    const preset = {
      name: presetName.trim(),
      indicators: indicators.map(({ type, params }) => ({
        id: createId(),
        type,
        params: { ...params }
      }))
    };
    if (existing >= 0) {
      savedPresets[existing] = preset;
    } else {
      savedPresets = [...savedPresets, preset];
    }
    savePresets();
    presetName = '';
    await tick();
  }

  async function loadPreset(preset: { name: string; indicators: IndicatorInstance[] }) {
    indicators = preset.indicators.map((ind) => ({
      ...ind,
      id: createId()
    }));
    await tick();
    resetRsiChart();
    rebuildIndicators();
    saveState();
    showPresets = false;
  }

  function deletePreset(name: string) {
    savedPresets = savedPresets.filter((p) => p.name !== name);
    savePresets();
  }

  function createId() {
    return typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `id-${Math.random().toString(36).slice(2, 9)}`;
  }


  function buildChart(container: HTMLDivElement) {
    if (!createChartFn || !crosshairModeRef) {
      throw new Error('Chart library not loaded');
    }
    const chartApi = createChartFn(container, {
      layout: {
        background: { color: 'transparent' },
        textColor: '#e2e8f0',
        fontFamily: 'Space Grotesk, sans-serif'
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.15)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.15)' }
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false
      },
      rightPriceScale: {
        borderVisible: false
      },
      crosshair: {
        mode: crosshairModeRef.Magnet
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chartApi.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });

    resizeObserver.observe(container);

    return { chartApi, resizeObserver };
  }

  function applyCrosshairMode() {
    if (!crosshairModeRef) {
      return;
    }
    const mode = crosshairSnap ? crosshairModeRef.Magnet : crosshairModeRef.Normal;
    chart?.applyOptions({ crosshair: { mode } });
    rsiChart?.applyOptions({ crosshair: { mode } });
  }

  function rebuildIndicators() {
    if (!chart || !candleSeries) {
      return;
    }

    overlaySeries.forEach((series) => chart?.removeSeries(series));
    overlaySeries.clear();

    if (rsiChart) {
      rsiSeries.forEach((series) => rsiChart?.removeSeries(series));
      rsiSeries.clear();
    }

    indicators.forEach((indicator, index) => {
      const def = indicatorRegistry[indicator.type];
      const color = palette[index % palette.length];
      if (def.pane === 'overlay') {
        const series = chart.addLineSeries({
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false
        });
        overlaySeries.set(indicator.id, series);
      } else {
        if (!rsiChart || !rsiContainer) {
          return;
        }
        const series = rsiChart.addLineSeries({
          color,
          lineWidth: 2,
          priceLineVisible: false,
          lastValueVisible: false
        });
        rsiSeries.set(indicator.id, series);
      }
    });

    updateIndicatorData();
  }

  function updateIndicatorData() {
    indicators.forEach((indicator) => {
      const def = indicatorRegistry[indicator.type];
      const values = def.compute(candles, indicator.params);
      const seriesData = toLineData(values);
      if (seriesData.length === 0) {
        return;
      }
      if (def.pane === 'overlay') {
        overlaySeries.get(indicator.id)?.setData(seriesData);
      } else {
        rsiSeries.get(indicator.id)?.setData(seriesData);
      }
    });
  }

  function resetRsiChart() {
    if (!rsiContainer) {
      return;
    }

    if (rsiChart) {
      rsiChart.remove();
      rsiSeries.clear();
    }
    if (chart && syncVisibleRange) {
      chart.timeScale().unsubscribeVisibleTimeRangeChange(syncVisibleRange);
      syncVisibleRange = null;
    }
    allowRangeSync = false;

    if (!indicators.some((indicator) => indicatorRegistry[indicator.type].pane === 'separate')) {
      rsiChart = null;
      return;
    }

    const { chartApi } = buildChart(rsiContainer);
    rsiChart = chartApi;
    rsiChart.priceScale('right').applyOptions({
      scaleMargins: { top: 0.2, bottom: 0.2 }
    });
    applyCrosshairMode();

    if (chart) {
      syncVisibleRange = (range) => {
        if (
          !allowRangeSync ||
          !range ||
          !rsiChart ||
          range.from === null ||
          range.to === null ||
          candles.length === 0
        ) {
          return;
        }
        try {
          rsiChart.timeScale().setVisibleRange(range);
        } catch (err) {
          return;
        }
      };
      chart.timeScale().subscribeVisibleTimeRangeChange(syncVisibleRange);
    }
  }

  async function refreshCandles(showLoading = false) {
    if (refreshInFlight) {
      return;
    }
    refreshInFlight = true;
    if (showLoading) {
      loading = true;
    }
    error = '';
    try {
      const to = new Date();
      const from = new Date(to.getTime() - getLookbackMs(timeframe));
      candles = await fetchCandles(symbol, timeframe, from, to);
      candleSeries?.setData(toCandlestickData(candles));
      updateIndicatorData();
      allowRangeSync = candles.length > 0;
      const last = candles[candles.length - 1];
      crosshair = last ?? null;
      lastBarUpdatedAt = last ? formatTimestamp(last.timestamp) : '';
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load candles';
    } finally {
      if (showLoading) {
        loading = false;
      }
      refreshInFlight = false;
    }
  }

  async function refreshLatestPrice() {
    if (latestInFlight || refreshInFlight || candles.length === 0) {
      return;
    }
    latestInFlight = true;
    try {
      const latest = await fetchLatestPrice(symbol);
      if (!latest) {
        return;
      }
      const last = candles[candles.length - 1];
      const bucketMs = getTimeframeMs(timeframe);
      if (latest.timestamp >= last.timestamp + bucketMs) {
        refreshCandles(false);
        return;
      }
      if (latest.timestamp < last.timestamp) {
        return;
      }

      const updated = {
        ...last,
        close: latest.price,
        high: Math.max(last.high, latest.price),
        low: Math.min(last.low, latest.price)
      };

      candles = [...candles.slice(0, -1), updated];
      candleSeries?.update(toCandlestickPoint(updated));
      updateIndicatorData();
    } finally {
      latestInFlight = false;
    }
  }

  async function addIndicator() {
    const def = indicatorRegistry[selectedIndicator];
    indicators = [
      ...indicators,
      {
        id: createId(),
        type: def.type,
        params: { ...def.defaultParams }
      }
    ];
    await tick();
    resetRsiChart();
    rebuildIndicators();
    saveState();
  }

  async function removeIndicator(id: string) {
    indicators = indicators.filter((indicator) => indicator.id !== id);
    if (anchorPickId === id) {
      anchorPickId = null;
    }
    await tick();
    resetRsiChart();
    rebuildIndicators();
    saveState();
  }

  function updateIndicator(id: string, updater: (current: IndicatorInstance) => IndicatorInstance) {
    indicators = indicators.map((indicator) =>
      indicator.id === id ? updater(indicator) : indicator
    );
    rebuildIndicators();
    saveState();
  }

  function handleLengthChange(id: string, event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    const length = Number(target.value);
    updateIndicator(id, (current) => ({
      ...current,
      params: { ...current.params, length }
    }));
  }

  function handleSourceChange(id: string, event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLSelectElement)) {
      return;
    }
    updateIndicator(id, (current) => ({
      ...current,
      params: { ...current.params, source: target.value as PriceSource }
    }));
  }

  function handleAnchorChange(id: string, event: Event) {
    const target = event.currentTarget;
    if (!(target instanceof HTMLInputElement)) {
      return;
    }
    updateIndicator(id, (current) => ({
      ...current,
      params: { ...current.params, anchorIso: target.value }
    }));
    if (anchorPickId === id) {
      anchorPickId = null;
    }
  }

  function setTimeframe(next: Timeframe) {
    timeframe = next;
    saveState();
    refreshCandles(true);
  }

  function setSymbol(next: string) {
    symbol = next;
    saveState();
    refreshCandles(true);
  }

  function toggleIndicators() {
    showIndicators = !showIndicators;
  }

  function handleCrosshairToggle() {
    crosshairSnap = !crosshairSnap;
    applyCrosshairMode();
  }

  function beginAnchorPick(id: string) {
    anchorPickId = id;
  }

  function getLabel(def: IndicatorDefinition, indicator: IndicatorInstance) {
    return def.label(indicator.params);
  }

  function getIndicatorColor(indicatorId: string): string {
    const index = indicators.findIndex((ind) => ind.id === indicatorId);
    return palette[index % palette.length];
  }

  function getIndicatorTooltip(indicator: IndicatorInstance): string {
    const def = indicatorRegistry[indicator.type];
    const params = indicator.params;
    switch (indicator.type) {
      case 'sma':
        return `Simple Moving Average: Sum of last ${params.length} ${params.source} prices / ${params.length}`;
      case 'ema':
        return `Exponential Moving Average: Weighted average with α = 2/(${params.length}+1)`;
      case 'rsi':
        return `Relative Strength Index: 100 - (100 / (1 + RS)), RS = avg gain / avg loss over ${params.length} periods`;
      case 'macd':
      case 'macdSignal':
      case 'macdHistogram':
        return `MACD(${params.macdFast ?? 12}, ${params.macdSlow ?? 26}, ${params.macdSignal ?? 9}): Fast EMA - Slow EMA`;
      case 'bollingerUpper':
      case 'bollingerLower':
        return `Bollinger Band: SMA(${params.length}) ± ${params.stdDev ?? 2} × σ`;
      case 'bollingerMiddle':
        return `Bollinger Middle: SMA(${params.length})`;
      case 'atr':
        return `Average True Range: Smoothed average of max(H-L, |H-Cp|, |L-Cp|) over ${params.length} periods`;
      case 'volume':
        return 'Trading volume for each candle';
      case 'volumeMA':
        return `Volume Moving Average: Average volume over ${params.length} periods`;
      case 'vwap':
        return 'Volume Weighted Average Price: Σ(TP × Vol) / Σ(Vol) from anchor';
      default:
        return def.name;
    }
  }

  function toggleFullscreen() {
    isFullscreen = !isFullscreen;
    if (isFullscreen) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  async function exportChartAsPNG() {
    if (!chartContainer) return;

    const canvas = chartContainer.querySelector('canvas');
    if (!canvas) return;

    const link = document.createElement('a');
    link.download = `${symbol}-${timeframe}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.target instanceof HTMLInputElement || event.target instanceof HTMLSelectElement) {
      return;
    }

    const key = event.key.toLowerCase();
    const tfMap: Record<string, Timeframe> = {
      '1': '1m',
      '2': '5m',
      '3': '10m',
      '4': '30m',
      '5': '60m',
      '6': '1d'
    };

    if (tfMap[key]) {
      event.preventDefault();
      setTimeframe(tfMap[key]);
    } else if (key === 'f') {
      event.preventDefault();
      toggleFullscreen();
    } else if (key === 'i') {
      event.preventDefault();
      toggleIndicators();
    } else if (key === 'e') {
      event.preventDefault();
      exportChartAsPNG();
    } else if (key === 'escape' && showIndicators) {
      showIndicators = false;
    }
  }

  onMount(async () => {
    if (!chartContainer) {
      return;
    }

    loadState();
    loadPresets();
    fetchSymbols().then((symbols) => {
      availableSymbols = symbols;
    });
    const lwc = await import('lightweight-charts');
    createChartFn = lwc.createChart;
    crosshairModeRef = lwc.CrosshairMode;
    const main = buildChart(chartContainer);
    chart = main.chartApi;

    candleSeries = chart.addCandlestickSeries({
      upColor: '#22c55e',
      downColor: '#ef4444',
      borderVisible: false,
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
      lastValueVisible: true,
      priceLineVisible: true
    });
    applyCrosshairMode();

    chart.subscribeCrosshairMove((param) => {
      if (!param || !param.seriesData || !candleSeries) {
        return;
      }
      const candle = param.seriesData.get(candleSeries) as Candle | undefined;
      if (candle && typeof candle.open === 'number') {
        crosshair = {
          timestamp: (param.time as number) * 1000,
          open: candle.open,
          high: candle.high,
          low: candle.low,
          close: candle.close,
          volume: 0
        };
      }
    });

    chart.subscribeClick((param) => {
      if (!anchorPickId || !param.time) {
        return;
      }
      let timestampMs: number | null = null;
      if (typeof param.time === 'number') {
        timestampMs = param.time * 1000;
      } else if ('year' in param.time) {
        timestampMs = Date.UTC(param.time.year, param.time.month - 1, param.time.day);
      }
      if (!timestampMs) {
        return;
      }
      updateIndicator(anchorPickId, (current) => ({
        ...current,
        params: { ...current.params, anchorIso: toLocalInputValue(timestampMs) }
      }));
      anchorPickId = null;
    });

    resetRsiChart();
    rebuildIndicators();
    refreshCandles(true);
    refreshTimer = setInterval(() => {
      refreshLatestPrice();
    }, TICK_REFRESH_MS);
    fullRefreshTimer = setInterval(() => {
      refreshCandles(false);
    }, BAR_REFRESH_MS);

    return () => {
      main.resizeObserver.disconnect();
      chart?.remove();
      rsiChart?.remove();
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }
      if (fullRefreshTimer) {
        clearInterval(fullRefreshTimer);
      }
    };
  });
</script>

<svelte:head>
  <title>OSS Charts</title>
</svelte:head>

<svelte:window on:keydown={handleKeydown} />

<div class="app">
  <header class="topbar">
    <div class="topbar-left">
      <div class="brand">
        <span class="logo">OSS Charts</span>
        <select class="symbol-select" bind:value={symbol} on:change={() => setSymbol(symbol)}>
          {#each availableSymbols as sym}
            <option value={sym}>{sym}</option>
          {/each}
        </select>
      </div>

      <div class="timeframes">
        {#each TIMEFRAMES as tf}
          <button class:selected={tf === timeframe} on:click={() => setTimeframe(tf)}>
            {tf.toUpperCase()}
          </button>
        {/each}
      </div>
    </div>

    <div class="topbar-right">
      <div class="ohlc">
        {#if crosshair}
          <span class="last-bar">Last bar {lastBarUpdatedAt}</span>
          <span class="ohlc-time">{formatTimestamp(crosshair.timestamp)}</span>
          <span class="ohlc-value"><span class="ohlc-label">O</span><span class="ohlc-price">{crosshair.open.toFixed(2)}</span></span>
          <span class="ohlc-value ohlc-high"><span class="ohlc-label">H</span><span class="ohlc-price">{crosshair.high.toFixed(2)}</span></span>
          <span class="ohlc-value ohlc-low"><span class="ohlc-label">L</span><span class="ohlc-price">{crosshair.low.toFixed(2)}</span></span>
          <span class="ohlc-value" class:ohlc-up={crosshair.close >= crosshair.open} class:ohlc-down={crosshair.close < crosshair.open}>
            <span class="ohlc-label">C</span><span class="ohlc-price">{crosshair.close.toFixed(2)}</span>
          </span>
        {:else}
          <span class="ohlc-waiting">Waiting for data</span>
        {/if}
      </div>

      <label class="crosshair-toggle">
        <input type="checkbox" checked={crosshairSnap} on:change={handleCrosshairToggle} />
        <span>Snap</span>
      </label>

      <button class="toolbar-btn" on:click={toggleFullscreen} title="Fullscreen (F)">
        {isFullscreen ? 'Exit' : 'Fullscreen'}
      </button>

      <button class="toolbar-btn" on:click={exportChartAsPNG} title="Export PNG (E)">
        Export
      </button>

      <button class="toolbar-btn" on:click={copyShareUrl} title="Copy shareable URL">
        Share
      </button>

      <div class="presets-menu">
        <button class="toolbar-btn" on:click={() => (showPresets = !showPresets)}>
          Presets
        </button>
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
            {#if savedPresets.length === 0}
              <p class="empty">No saved presets.</p>
            {/if}
            {#each savedPresets as preset}
              <div class="preset-item">
                <button class="preset-load" on:click={() => loadPreset(preset)}>
                  {preset.name}
                  <span class="preset-count">({preset.indicators.length} indicators)</span>
                </button>
                <button class="remove" on:click={() => deletePreset(preset.name)}>Delete</button>
              </div>
            {/each}
          </div>
        {/if}
      </div>

      <div class="indicator-menu">
        <button class="indicator-toggle" on:click={toggleIndicators}>
          Indicators {indicators.length > 0 ? `(${indicators.length})` : ''}
        </button>
        {#if showIndicators}
          <div class="panel indicator-panel">
            <div class="panel-header">Indicators</div>
            <div class="panel-row">
              <select bind:value={selectedIndicator}>
                {#each Object.values(indicatorRegistry) as indicator}
                  <option value={indicator.type}>{indicator.name}</option>
                {/each}
              </select>
              <button class="add" on:click={addIndicator}>Add</button>
            </div>

            {#if indicators.length === 0}
              <p class="empty">No indicators yet.</p>
            {/if}

            {#each indicators as indicator}
              <div class="indicator">
                <div class="indicator-header">
                  <span>{indicatorRegistry[indicator.type].name}</span>
                  <button class="remove" on:click={() => removeIndicator(indicator.id)}>
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
                        on:change={(event) => handleLengthChange(indicator.id, event)}
                      />
                    </label>
                    <label>
                      Source
                      <select
                        value={indicator.params.source}
                        on:change={(event) => handleSourceChange(indicator.id, event)}
                      >
                        {#each sources as source}
                          <option value={source}>{source}</option>
                        {/each}
                      </select>
                    </label>
                  {:else}
                    <label>
                      Anchor
                      <input
                        type="datetime-local"
                        value={indicator.params.anchorIso}
                        on:change={(event) => handleAnchorChange(indicator.id, event)}
                      />
                    </label>
                    <button
                      class="anchor-btn"
                      class:active={anchorPickId === indicator.id}
                      on:click={() => beginAnchorPick(indicator.id)}
                    >
                      {anchorPickId === indicator.id ? 'Click chart to set' : 'Pick on chart'}
                    </button>
                  {/if}
                </div>
                <div class="indicator-label">
                  {getLabel(indicatorRegistry[indicator.type], indicator)}
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    </div>
  </header>

  <main class="layout">
    <section class="charts">
      <div class="chart-card">
        <div class="legend">
          <span class="legend-title">Price</span>
          {#each indicators.filter((indicator) => indicatorRegistry[indicator.type].pane === 'overlay') as indicator}
            <span
              class="legend-item"
              style="--indicator-color: {getIndicatorColor(indicator.id)}"
              title={getIndicatorTooltip(indicator)}
            >
              <span class="legend-dot"></span>
              {getLabel(indicatorRegistry[indicator.type], indicator)}
            </span>
          {/each}
        </div>
        <div class="chart" bind:this={chartContainer}>
          <div class="chart-watermark">{symbol}</div>
        </div>
        {#if loading}
          <div class="overlay loading-overlay">
            <div class="loading-spinner"></div>
            <span>Loading {symbol} data...</span>
          </div>
        {/if}
        {#if error}
          <div class="overlay error">{error}</div>
        {/if}
      </div>

      {#if indicators.some((indicator) => indicatorRegistry[indicator.type].pane === 'separate')}
        <div class="chart-card rsi">
          <div class="legend">
            <span class="legend-title">Oscillators</span>
            {#each indicators.filter((indicator) => indicatorRegistry[indicator.type].pane === 'separate') as indicator}
              <span
                class="legend-item"
                style="--indicator-color: {getIndicatorColor(indicator.id)}"
                title={getIndicatorTooltip(indicator)}
              >
                <span class="legend-dot"></span>
                {getLabel(indicatorRegistry[indicator.type], indicator)}
              </span>
            {/each}
          </div>
          <div class="chart small" bind:this={rsiContainer}></div>
        </div>
      {/if}
    </section>

  </main>

  <footer class="footer">
    Charts powered by
    <a href="https://github.com/tradingview/lightweight-charts" target="_blank" rel="noreferrer">
      TradingView Lightweight Charts
    </a>
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

  .topbar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    padding: 16px 24px;
    border-bottom: 1px solid rgba(148, 163, 184, 0.2);
    background: rgba(15, 23, 42, 0.75);
    backdrop-filter: blur(8px);
    position: relative;
    z-index: 10;
  }

  .topbar-left {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
  }

  .topbar-right {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px;
    margin-left: auto;
    justify-content: flex-end;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    font-weight: 600;
  }

  .logo {
    font-size: 18px;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .symbol-select {
    padding: 4px 10px;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.35);
    font-size: 14px;
    color: #e2e8f0;
    font-family: inherit;
    font-weight: 600;
    cursor: pointer;
  }

  .symbol-select option {
    background: #0f172a;
    color: #e2e8f0;
  }

  .timeframes {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
  }

  .timeframes button {
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: transparent;
    color: #e2e8f0;
    padding: 6px 10px;
    border-radius: 6px;
    cursor: pointer;
    font-weight: 500;
    transition: all 0.15s ease;
  }

  .timeframes button:hover:not(.selected) {
    background: rgba(148, 163, 184, 0.1);
    border-color: rgba(148, 163, 184, 0.5);
    transform: translateY(-1px);
  }

  .timeframes button:active {
    transform: translateY(0);
  }

  .timeframes button.selected {
    background: rgba(94, 234, 212, 0.15);
    border-color: rgba(94, 234, 212, 0.6);
    box-shadow: 0 0 12px rgba(94, 234, 212, 0.2);
  }

  .ohlc {
    display: flex;
    align-items: center;
    gap: 12px;
    font-size: 14px;
    flex-wrap: wrap;
  }

  .last-bar {
    color: #64748b;
    font-size: 11px;
  }

  .ohlc-time {
    color: #94a3b8;
  }

  .ohlc-value {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .ohlc-label {
    color: #64748b;
    font-size: 11px;
    font-weight: 600;
  }

  .ohlc-price {
    font-family: 'JetBrains Mono', 'SF Mono', 'Fira Code', monospace;
    font-weight: 500;
    font-size: 14px;
    min-width: 65px;
    text-align: right;
  }

  .ohlc-high .ohlc-price {
    color: #4ade80;
  }

  .ohlc-low .ohlc-price {
    color: #f87171;
  }

  .ohlc-up .ohlc-price {
    color: #22c55e;
  }

  .ohlc-down .ohlc-price {
    color: #ef4444;
  }

  .ohlc-waiting {
    color: #64748b;
    font-style: italic;
  }

  .layout {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    padding: 24px;
    min-height: calc(100vh - 140px);
  }

  .charts {
    display: flex;
    flex-direction: column;
    gap: 20px;
    height: 100%;
  }

  .chart-card {
    position: relative;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.5) 100%);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    flex: 1;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    transition: border-color 0.2s ease, box-shadow 0.2s ease;
  }

  .chart-card:hover {
    border-color: rgba(148, 163, 184, 0.25);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .chart-card.rsi {
    flex: 0 0 220px;
    min-height: 220px;
  }

  .chart {
    position: relative;
    flex: 1;
    min-height: 360px;
  }

  .chart.small {
    height: 100%;
    min-height: 200px;
  }

  .chart-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 120px;
    font-weight: 700;
    color: rgba(148, 163, 184, 0.04);
    pointer-events: none;
    user-select: none;
    z-index: 0;
    letter-spacing: 0.05em;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    margin-bottom: 8px;
  }

  .legend-title {
    font-weight: 600;
    letter-spacing: 0.03em;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 3px 10px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid color-mix(in srgb, var(--indicator-color) 40%, transparent);
    color: var(--indicator-color);
    font-weight: 500;
    cursor: help;
    transition: background 0.15s ease, transform 0.1s ease;
  }

  .legend-item:hover {
    background: rgba(148, 163, 184, 0.2);
    transform: translateY(-1px);
  }

  .legend-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--indicator-color);
    box-shadow: 0 0 6px var(--indicator-color);
  }

  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 16px;
    font-size: 14px;
    background: rgba(2, 6, 23, 0.75);
    backdrop-filter: blur(4px);
    border-radius: 16px;
  }

  .loading-overlay {
    color: #94a3b8;
  }

  .loading-spinner {
    width: 40px;
    height: 40px;
    border: 3px solid rgba(148, 163, 184, 0.2);
    border-top-color: #5eead4;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .overlay.error {
    color: #fca5a5;
  }

  .panel {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .indicator-menu,
  .presets-menu {
    position: relative;
  }

  .presets-panel {
    position: absolute;
    right: 0;
    top: calc(100% + 10px);
    width: 280px;
    max-height: 50vh;
    overflow: auto;
    z-index: 30;
    background: rgba(2, 6, 23, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.35);
    box-shadow: 0 24px 40px rgba(2, 6, 23, 0.6);
  }

  .preset-input {
    flex: 1;
    font-family: inherit;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: #e2e8f0;
    padding: 6px 8px;
    border-radius: 8px;
  }

  .preset-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px;
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    background: rgba(2, 6, 23, 0.4);
  }

  .preset-load {
    background: transparent;
    border: 0;
    color: #e2e8f0;
    cursor: pointer;
    text-align: left;
    font-size: 13px;
  }

  .preset-count {
    opacity: 0.6;
    font-size: 11px;
  }

  .indicator-toggle {
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: transparent;
    color: #e2e8f0;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    white-space: nowrap;
    position: relative;
    z-index: 31;
  }

  .indicator-panel {
    position: absolute;
    right: 0;
    top: calc(100% + 10px);
    width: 320px;
    max-height: 70vh;
    overflow: auto;
    z-index: 30;
    background: rgba(2, 6, 23, 0.96);
    border: 1px solid rgba(148, 163, 184, 0.35);
    box-shadow: 0 24px 40px rgba(2, 6, 23, 0.6);
  }

  .panel-header {
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    font-size: 12px;
  }

  .panel-row {
    display: flex;
    gap: 8px;
  }

  .panel-row select,
  .panel-row button,
  .indicator-body input,
  .indicator-body select {
    font-family: inherit;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(148, 163, 184, 0.3);
    color: #e2e8f0;
    padding: 6px 8px;
    border-radius: 8px;
  }

  .crosshair-toggle {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: #cbd5f5;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.3);
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
  }

  .crosshair-toggle input {
    accent-color: #5eead4;
  }

  .toolbar-btn {
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: transparent;
    color: #e2e8f0;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
    font-weight: 500;
    font-size: 12px;
    transition: all 0.15s ease;
  }

  .toolbar-btn:hover {
    background: rgba(148, 163, 184, 0.15);
    border-color: rgba(148, 163, 184, 0.5);
    transform: translateY(-1px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
  }

  .toolbar-btn:active {
    transform: translateY(0);
    box-shadow: none;
  }

  .panel-row .add {
    background: rgba(94, 234, 212, 0.2);
    border-color: rgba(94, 234, 212, 0.6);
    cursor: pointer;
  }

  .indicator {
    border: 1px solid rgba(148, 163, 184, 0.2);
    border-radius: 12px;
    padding: 12px;
    background: rgba(2, 6, 23, 0.4);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .indicator-header {
    display: flex;
    justify-content: space-between;
    font-weight: 500;
  }

  .indicator-header .remove {
    background: transparent;
    color: #fca5a5;
    border: 0;
    cursor: pointer;
    font-size: 12px;
  }

  .indicator-body {
    display: grid;
    gap: 10px;
  }

  .indicator-body label {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 12px;
  }

  .anchor-btn {
    align-self: flex-start;
    border: 1px solid rgba(148, 163, 184, 0.3);
    background: rgba(15, 23, 42, 0.9);
    color: #e2e8f0;
    padding: 6px 10px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 12px;
  }

  .anchor-btn.active {
    border-color: rgba(94, 234, 212, 0.7);
    background: rgba(94, 234, 212, 0.15);
    color: #e2e8f0;
  }

  .indicator-body input[type='datetime-local'] {
    color-scheme: dark;
  }

  .indicator-label {
    font-size: 12px;
    opacity: 0.8;
  }

  .empty {
    font-size: 13px;
    opacity: 0.7;
  }

  .footer {
    margin-top: auto;
    padding: 16px 24px 24px;
    font-size: 12px;
    opacity: 0.8;
  }

  .footer a {
    color: #38bdf8;
  }

  @media (max-width: 960px) {
    .layout {
      grid-template-columns: 1fr;
      padding: 16px;
    }

    .indicator-panel,
    .presets-panel {
      width: min(90vw, 320px);
      right: 0;
      left: auto;
    }

    .topbar {
      padding: 12px 16px;
    }

    .ohlc {
      font-size: 12px;
      gap: 8px;
    }

    .ohlc-price {
      font-size: 12px;
      min-width: 55px;
    }

    .chart-watermark {
      font-size: 60px;
    }
  }

  @media (max-width: 640px) {
    .topbar {
      flex-direction: column;
      align-items: flex-start;
      gap: 12px;
    }

    .topbar-right {
      width: 100%;
      justify-content: flex-start;
    }

    .ohlc {
      order: -1;
      width: 100%;
    }

    .timeframes {
      width: 100%;
    }

    .timeframes button {
      flex: 1;
      padding: 8px 4px;
      font-size: 11px;
    }

    .chart {
      min-height: 280px;
    }

    .chart-card.rsi {
      min-height: 180px;
    }

    .legend {
      font-size: 10px;
    }

    .legend-item {
      padding: 2px 6px;
      font-size: 10px;
    }

    .legend-dot {
      width: 6px;
      height: 6px;
    }

    .chart-watermark {
      font-size: 40px;
    }
  }
</style>
