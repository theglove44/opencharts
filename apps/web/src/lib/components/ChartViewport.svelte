<script lang="ts">
  import { onMount, tick, createEventDispatcher } from 'svelte';

  import type { IChartApi, ISeriesApi } from 'lightweight-charts';
  import type { Candle, Timeframe } from '@oss-charts/core';
  import {
    formatTimestamp,
    getLookbackMs,
    getTimeframeMs,
    toCandlestickData,
    toCandlestickPoint,
    toLineData,
    toLocalInputValue,
  } from '$lib/chart-helpers';
  import {
    indicatorRegistry,
    type IndicatorDefinition,
    type IndicatorInstance,
  } from '@oss-charts/indicators';
  import { fetchCandles, fetchLatestPrice } from '$lib/api';

  const dispatch = createEventDispatcher();
  const palette = ['#f97316', '#22c55e', '#0ea5e9', '#eab308', '#ef4444', '#8b5cf6'];

  export let id: string;
  export let symbol: string;
  export let timeframe: Timeframe = '5m';
  export let indicators: IndicatorInstance[] = [];
  export let isActive = false;
  export let crosshairSnap = true;

  let chartContainer: HTMLDivElement | null = null;
  let rsiContainer: HTMLDivElement | null = null;

  let chart: IChartApi | null = null;
  let candleSeries: ISeriesApi<'Candlestick'> | null = null;
  let rsiChart: IChartApi | null = null;

  let overlaySeries = new Map<string, ISeriesApi<'Line'>>();
  let rsiSeries = new Map<string, ISeriesApi<'Line'>>();

  let createChartFn: typeof import('lightweight-charts').createChart | null = null;
  let crosshairModeRef: typeof import('lightweight-charts').CrosshairMode | null = null;
  let syncVisibleRange: ((range: any) => void) | null = null;
  let allowRangeSync = false;

  let candles: Candle[] = [];
  let loading = false;
  let error = '';
  let crosshair: Candle | null = null;
  let refreshTimer: ReturnType<typeof setInterval> | null = null;
  let fullRefreshTimer: ReturnType<typeof setInterval> | null = null;
  let refreshInFlight = false;
  let latestInFlight = false;
  let lastBarUpdatedAt = '';
  let anchorPickId: string | null = null;

  const TICK_REFRESH_MS = 1_000;
  const BAR_REFRESH_MS = 60_000;

  $: {
    if (symbol || timeframe) {
      // Trigger refresh when props change
      refreshCandles(true);
    }
  }

  $: {
    if (indicators) {
      // Debounce or just check diff?
      // For simplicity, rebuild on change, but check if chart exists
      if (chart) {
        // We need to handle rsi chart creation/deletion if indicators change pane type
        resetRsiChart();
        rebuildIndicators();
      }
    }
  }

  $: if (crosshairSnap && chart && crosshairModeRef) {
    applyCrosshairMode();
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
        fontFamily: 'Space Grotesk, sans-serif',
      },
      grid: {
        vertLines: { color: 'rgba(148, 163, 184, 0.15)' },
        horzLines: { color: 'rgba(148, 163, 184, 0.15)' },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderVisible: false,
      },
      crosshair: {
        mode: crosshairModeRef.Magnet,
      },
    });

    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        chartApi.applyOptions({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
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
      const lines = def.lines || ['default'];

      lines.forEach((line) => {
        const seriesKey = lines.length > 1 ? `${indicator.id}-${line}` : indicator.id;

        if (def.pane === 'overlay') {
          const series = chart.addLineSeries({
            color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          overlaySeries.set(seriesKey, series);
        } else {
          if (!rsiChart || !rsiContainer) {
            return;
          }
          const series = rsiChart.addLineSeries({
            color,
            lineWidth: 2,
            priceLineVisible: false,
            lastValueVisible: false,
          });
          rsiSeries.set(seriesKey, series);
        }
      });
    });

    updateIndicatorData();
  }

  function updateIndicatorData() {
    indicators.forEach((indicator) => {
      const def = indicatorRegistry[indicator.type];
      const values = def.compute(candles, indicator.params);
      const lines = def.lines || ['default'];

      lines.forEach((line) => {
        const seriesKey = lines.length > 1 ? `${indicator.id}-${line}` : indicator.id;

        const seriesData = toLineData(
          values.map((point) => ({
            timestamp: point.timestamp,
            value:
              line === 'default' || line === 'value' ? point.value : (point[line] ?? point.value),
          })),
        );

        if (seriesData.length === 0) {
          return;
        }

        if (def.pane === 'overlay') {
          overlaySeries.get(seriesKey)?.setData(seriesData);
        } else {
          rsiSeries.get(seriesKey)?.setData(seriesData);
        }
      });
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
      scaleMargins: { top: 0.2, bottom: 0.2 },
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
        low: Math.min(last.low, latest.price),
      };

      candles = [...candles.slice(0, -1), updated];
      candleSeries?.update(toCandlestickPoint(updated));
      updateIndicatorData();
    } finally {
      latestInFlight = false;
    }
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
      case 'bollinger':
        return `Bollinger Bands: SMA(${params.length}) ± ${params.stdDev ?? 2} × σ`;
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

  export function beginAnchorPick(indicatorId: string) {
    anchorPickId = indicatorId;
  }

  onMount(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      if (!chartContainer) {
        return;
      }

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
        priceLineVisible: true,
      });
      applyCrosshairMode();

      chart.subscribeCrosshairMove((param) => {
        if (!param || !param.seriesData || !candleSeries) {
          return;
        }
        const data = param.seriesData.get(candleSeries);
        // @ts-ignore
        const candle = data as Candle | undefined;

        if (candle && typeof candle.open === 'number') {
          crosshair = {
            timestamp: (param.time as number) * 1000,
            open: candle.open,
            high: candle.high,
            low: candle.low,
            close: candle.close,
            volume: 0,
          };
        }
      });

      chart.subscribeClick((param) => {
        dispatch('activate'); // Activate chart on click

        if (!anchorPickId || !param.time) {
          return;
        }
        let timestampMs: number | null = null;
        // @ts-ignore
        if (typeof param.time === 'number') {
          timestampMs = param.time * 1000;
          // @ts-ignore
        } else if (param.time && typeof param.time === 'object' && 'year' in param.time) {
          // @ts-ignore
          const t = param.time;
          timestampMs = Date.UTC(t.year, t.month - 1, t.day);
        }
        if (!timestampMs) {
          return;
        }

        dispatch('pickAnchor', { id: anchorPickId, timestampMs });
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

      cleanup = () => {
        main.resizeObserver.disconnect();
        chart?.remove();
        rsiChart?.remove();
        if (refreshTimer) clearInterval(refreshTimer);
        if (fullRefreshTimer) clearInterval(fullRefreshTimer);
      };
    })();

    return () => {
      if (cleanup) cleanup();
    };
  });
</script>

<!-- svelte-ignore a11y-click-events-have-key-events -->
<!-- svelte-ignore a11y-no-static-element-interactions -->
<div class="chart-card" class:active={isActive} on:click={() => dispatch('activate')}>
  <div class="legend">
    <span class="legend-symbol">{symbol}</span>
    {#if crosshair}
      <div class="ohlc-values">
        <span class="ohlc-value">O <span class="ohlc-price">{crosshair.open.toFixed(2)}</span></span
        >
        <span class="ohlc-value ohlc-high"
          >H <span class="ohlc-price">{crosshair.high.toFixed(2)}</span></span
        >
        <span class="ohlc-value ohlc-low"
          >L <span class="ohlc-price">{crosshair.low.toFixed(2)}</span></span
        >
        <span
          class="ohlc-value"
          class:ohlc-up={crosshair.close >= crosshair.open}
          class:ohlc-down={crosshair.close < crosshair.open}
        >
          C <span class="ohlc-price">{crosshair.close.toFixed(2)}</span>
        </span>
      </div>
    {/if}
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

  <div class="chart-overlay">
    <div class="chart-watermark">{symbol}</div>
  </div>

  <div class="chart" bind:this={chartContainer}></div>

  {#if loading}
    <div class="overlay loading-overlay">
      <div class="loading-spinner"></div>
      <span>Loading {symbol} data...</span>
    </div>
  {/if}
  {#if error}
    <div class="overlay error">{error}</div>
  {/if}

  {#if indicators.some((indicator) => indicatorRegistry[indicator.type].pane === 'separate')}
    <div class="rsi-section">
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
</div>

<style>
  .chart-card {
    position: relative;
    background: linear-gradient(135deg, rgba(15, 23, 42, 0.8) 0%, rgba(15, 23, 42, 0.5) 100%);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 16px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    flex: 1;
    min-width: 0;
    min-height: 0;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
    transition:
      border-color 0.2s ease,
      box-shadow 0.2s ease;
  }

  .chart-card:hover {
    border-color: rgba(148, 163, 184, 0.25);
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .chart-card.active {
    border-color: #38bdf8;
    box-shadow:
      0 0 0 2px rgba(56, 189, 248, 0.25),
      0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .ohlc-values {
    display: flex;
    gap: 8px;
    margin-right: 12px;
    font-size: 12px;
    font-weight: 500;
  }

  .chart-overlay {
    position: absolute;
    top: 16px;
    left: 16px;
    right: 16px;
    pointer-events: none;
    z-index: 5;
    display: flex;
    justify-content: center; /* Center watermark */
    align-items: center;
    height: 100%; /* Cover full chart area for watermark centering? */
  }

  /* .ohlc-overlay styles removed/replaced by chart-overlay */

  .ohlc-price {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 500;
    color: #e2e8f0;
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

  .chart {
    position: relative;
    flex: 1;
    min-height: 200px;
    width: 100%;
  }

  .chart.small {
    /* height: 100%; */
    min-height: 150px;
  }

  .rsi-section {
    display: flex;
    flex-direction: column;
    flex: 0 0 160px; /* fixed height for RSI section? */
    margin-top: 8px;
    border-top: 1px solid rgba(148, 163, 184, 0.1);
    padding-top: 8px;
  }

  .chart-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 80px;
    font-weight: 700;
    color: rgba(148, 163, 184, 0.04);
    pointer-events: none;
    user-select: none;
    letter-spacing: 0.05em;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    font-size: 12px;
    margin-bottom: 8px;
    min-height: 24px;
    z-index: 6;
    position: relative;
    pointer-events: none; /* Let clicks pass through to chart */
  }

  .legend-title {
    margin-right: 4px;
    opacity: 0.5;
    pointer-events: auto;
  }

  .legend-symbol {
    font-weight: 700;
    margin-right: 8px;
    font-size: 14px;
    color: #e2e8f0;
    pointer-events: auto;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 2px 8px;
    border-radius: 999px;
    background: rgba(148, 163, 184, 0.1);
    border: 1px solid color-mix(in srgb, var(--indicator-color) 40%, transparent);
    color: var(--indicator-color);
    font-weight: 500;
    cursor: help;
    pointer-events: auto;
  }

  .legend-dot {
    width: 6px;
    height: 6px;
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
    z-index: 20;
  }

  .loading-overlay {
    color: #94a3b8;
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
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

  @media (max-width: 640px) {
    .chart-watermark {
      font-size: 40px;
    }
  }
</style>
