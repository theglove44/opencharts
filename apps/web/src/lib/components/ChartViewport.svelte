<script lang="ts">
  import { onMount } from 'svelte';

  import type { IChartApi, ISeriesApi } from 'lightweight-charts';
  import type { Candle, Timeframe } from '@oss-charts/core';
  import {
    getLookbackMs,
    getTimeframeMs,
    toCandlestickData,
    toCandlestickPoint,
    toLineData,
  } from '$lib/chart-helpers';
  import {
    indicatorRegistry,
    type IndicatorDefinition,
    type IndicatorInstance,
  } from '@oss-charts/indicators';
  import { fetchCandles } from '$lib/api';
  import { subscribeLatestPrice, type PriceUpdate } from '$lib/state/price-ticker.svelte';
  import ChartDrawings from './ChartDrawings.svelte';
  import type { Drawing, DrawingType } from '$lib/types/drawing';

  interface Props {
    id: string;
    symbol: string;
    timeframe?: Timeframe;
    indicators?: IndicatorInstance[];
    isActive?: boolean;
    crosshairSnap?: boolean;
    activeTool?: DrawingType | null;
    drawings?: Drawing[];
    onactivate?: () => void;
    onpickanchor?: (detail: { id: string; timestampMs: number }) => void;
    oncreate?: (drawing: Drawing) => void;
    ondelete?: (drawingId: string) => void;
  }

  type VisibleRangeHandler = Parameters<
    ReturnType<IChartApi['timeScale']>['subscribeVisibleTimeRangeChange']
  >[0];

  const palette = ['#f97316', '#22c55e', '#0ea5e9', '#eab308', '#ef4444', '#8b5cf6'];

  // Recomputing every indicator series on each price tick is wasteful; a short
  // throttle keeps oscillator/overlay tails fresh without per-second full sweeps.
  const INDICATOR_SYNC_MS = 3_000;
  const BAR_REFRESH_MS = 60_000;

  let {
    id,
    symbol,
    timeframe = '5m',
    indicators = [],
    isActive = false,
    crosshairSnap = true,
    activeTool = null,
    drawings = [],
    onactivate,
    onpickanchor,
    oncreate,
    ondelete,
  }: Props = $props();

  let chartContainer: HTMLDivElement | null = null;
  let rsiContainer: HTMLDivElement | null = $state(null);

  let width = $state(0);
  let height = $state(0);

  let chart: IChartApi | null = $state(null);
  let candleSeries: ISeriesApi<'Candlestick'> | null = $state(null);
  let rsiChart: IChartApi | null = null;

  let overlaySeries = new Map<string, ISeriesApi<'Line'>>();
  let rsiSeries = new Map<string, ISeriesApi<'Line'>>();

  let createChartFn: typeof import('lightweight-charts').createChart | null = null;
  let crosshairModeRef: typeof import('lightweight-charts').CrosshairMode | null = null;
  let syncVisibleRange: VisibleRangeHandler | null = null;
  let allowRangeSync = false;

  let candles: Candle[] = [];
  let loading = $state(false);
  let error = $state('');
  let crosshair = $state<Candle | null>(null);
  let refreshInFlight = false;
  let fullRefreshPending = false;
  let anchorPickId: string | null = null;
  let noData = $state(false);
  let ready = $state(false);
  let lastIndicatorSync = 0;

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
        width = entry.contentRect.width;
        height = entry.contentRect.height;
        chartApi.applyOptions({
          width: width,
          height: height,
        });
      }
    });

    resizeObserver.observe(container);

    return { chartApi, resizeObserver };
  }

  function applyCrosshairMode(snap = crosshairSnap) {
    if (!crosshairModeRef) {
      return;
    }
    const mode = snap ? crosshairModeRef.Magnet : crosshairModeRef.Normal;
    chart?.applyOptions({ crosshair: { mode } });
    rsiChart?.applyOptions({ crosshair: { mode } });
  }

  $effect(() => {
    if (chart && crosshairModeRef) {
      applyCrosshairMode(crosshairSnap);
    }
  });

  $effect(() => {
    if (chart && ready) {
      void indicators;
      resetRsiChart();
      rebuildIndicators();
    }
  });

  // Data loading is driven solely by this effect; `ready` gates it so we never
  // fetch before the series exists and never fetch twice on mount.
  $effect(() => {
    if (ready) {
      void symbol;
      void timeframe;
      refreshCandles(true);
    }
  });

  // One subscription per chart; identical symbols across charts share a poll.
  $effect(() => {
    if (!ready || !candleSeries) return;
    return subscribeLatestPrice(symbol, applyLatestPrice);
  });

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
          if (!rsiChart) {
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
    lastIndicatorSync = Date.now();

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
        } catch {
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
      noData = candles.length === 0;
      candleSeries?.setData(toCandlestickData(candles));
      updateIndicatorData();
      allowRangeSync = candles.length > 0;
      crosshair = candles[candles.length - 1] ?? null;
    } catch (err) {
      error = err instanceof Error ? err.message : 'Failed to load candles';
    } finally {
      if (showLoading) {
        loading = false;
      }
      refreshInFlight = false;

      if (fullRefreshPending) {
        fullRefreshPending = false;
        refreshCandles(false);
      }
    }
  }

  function applyLatestPrice(update: PriceUpdate) {
    if (candles.length === 0) {
      return;
    }
    const last = candles[candles.length - 1];
    const bucketMs = getTimeframeMs(timeframe);

    if (update.timestamp >= last.timestamp + bucketMs) {
      // A new bar started; request a full refill (coalesced while in flight).
      fullRefreshPending = true;
      refreshCandles(false);
      return;
    }
    if (update.timestamp < last.timestamp) {
      return;
    }

    const updated: Candle = {
      ...last,
      close: update.price,
      high: Math.max(last.high, update.price),
      low: Math.min(last.low, update.price),
    };

    candles = [...candles.slice(0, -1), updated];
    candleSeries?.update(toCandlestickPoint(updated));
    crosshair = updated;

    if (Date.now() - lastIndicatorSync >= INDICATOR_SYNC_MS) {
      updateIndicatorData();
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
        // @ts-expect-error Lightweight Charts does not retain custom candle fields.
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
        onactivate?.();

        if (!anchorPickId || !param.time) {
          return;
        }
        let timestampMs: number | null = null;
        if (typeof param.time === 'number') {
          timestampMs = param.time * 1000;
        } else if (param.time && typeof param.time === 'object' && 'year' in param.time) {
          const t = param.time;
          timestampMs = Date.UTC(t.year, t.month - 1, t.day);
        }
        if (!timestampMs) {
          return;
        }

        onpickanchor?.({ id: anchorPickId, timestampMs });
        anchorPickId = null;
      });

      resetRsiChart();
      rebuildIndicators();
      ready = true;

      const fullRefreshTimer = setInterval(() => {
        if (!document.hidden) {
          refreshCandles(false);
        }
      }, BAR_REFRESH_MS);

      cleanup = () => {
        main.resizeObserver.disconnect();
        chart?.remove();
        rsiChart?.remove();
        clearInterval(fullRefreshTimer);
      };
    })();

    return () => {
      if (cleanup) cleanup();
    };
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="chart-card" class:active={isActive} data-chart-id={id} onclick={() => onactivate?.()}>
  <div class="legend">
    <span class="legend-symbol">{symbol}</span>
    {#if crosshair}
      <div class="ohlc-values">
        <span class="ohlc-value">O <span class="ohlc-price">{crosshair.open.toFixed(2)}</span></span>
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
    {#each indicators.filter((indicator) => indicatorRegistry[indicator.type].pane === 'overlay') as indicator (indicator.id)}
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

  {#if chart && candleSeries}
    <ChartDrawings
      {chart}
      series={candleSeries}
      {drawings}
      {activeTool}
      {width}
      {height}
      {oncreate}
      {ondelete}
    />
  {/if}

  {#if loading}
    <div class="overlay loading-overlay">
      <div class="loading-spinner"></div>
      <span>Loading {symbol} data...</span>
    </div>
  {/if}
  {#if error}
    <div class="overlay error">{error}</div>
  {/if}
  {#if !loading && !error && noData}
    <div class="overlay no-data">
      <div class="no-data-icon">∅</div>
      <span>No data available for <span class="highlight">{symbol}</span></span>
      <span class="sub-text">Symbol might be invalid or not supported by data provider.</span>
    </div>
  {/if}

  {#if indicators.some((indicator) => indicatorRegistry[indicator.type].pane === 'separate')}
    <div class="oscillator-section">
      <div class="legend">
        <span class="legend-title">Oscillators</span>
        {#each indicators.filter((indicator) => indicatorRegistry[indicator.type].pane === 'separate') as indicator (indicator.id)}
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
    background: linear-gradient(135deg, var(--surface-card-from) 0%, var(--surface-card-to) 100%);
    border: 1px solid var(--border-subtle);
    border-radius: var(--radius-2xl);
    padding: var(--space-4);
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
    border-color: var(--accent);
    box-shadow:
      0 0 0 2px rgba(56, 189, 248, 0.25),
      0 8px 32px rgba(0, 0, 0, 0.3);
  }

  .ohlc-values {
    display: flex;
    gap: var(--space-2);
    margin-right: var(--space-3);
    font-size: 12px;
    font-weight: 500;
  }

  .chart-overlay {
    position: absolute;
    top: var(--space-4);
    left: var(--space-4);
    right: var(--space-4);
    pointer-events: none;
    z-index: 5;
    display: flex;
    justify-content: center;
    align-items: center;
    height: 100%;
  }

  .ohlc-price {
    font-family: var(--font-mono);
    font-weight: 500;
    color: var(--text-primary);
  }

  .ohlc-high .ohlc-price {
    color: var(--up-bright);
  }
  .ohlc-low .ohlc-price {
    color: var(--down-bright);
  }
  .ohlc-up .ohlc-price {
    color: var(--up);
  }
  .ohlc-down .ohlc-price {
    color: var(--down);
  }

  .chart {
    position: relative;
    flex: 1;
    min-height: 200px;
    width: 100%;
  }

  .chart.small {
    min-height: 150px;
  }

  .oscillator-section {
    display: flex;
    flex-direction: column;
    flex: 0 0 160px;
    margin-top: var(--space-2);
    border-top: 1px solid var(--border-subtle);
    padding-top: var(--space-2);
  }

  .chart-watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    font-size: 80px;
    font-weight: 700;
    color: var(--watermark);
    pointer-events: none;
    user-select: none;
    letter-spacing: 0.05em;
  }

  .legend {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    flex-wrap: wrap;
    font-size: 12px;
    margin-bottom: var(--space-2);
    min-height: 24px;
    z-index: 6;
    position: relative;
    pointer-events: none;
  }

  .legend-title {
    margin-right: var(--space-1);
    opacity: 0.5;
    pointer-events: auto;
  }

  .legend-symbol {
    font-weight: 700;
    margin-right: var(--space-2);
    font-size: 14px;
    color: var(--text-primary);
    pointer-events: auto;
  }

  .legend-item {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
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
    gap: var(--space-4);
    font-size: 14px;
    background: rgba(2, 6, 23, 0.75);
    backdrop-filter: blur(4px);
    border-radius: var(--radius-2xl);
    z-index: 20;
  }

  .loading-overlay {
    color: var(--text-secondary);
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(148, 163, 184, 0.2);
    border-top-color: var(--teal);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }

  .overlay.error {
    color: var(--danger-text);
  }

  .overlay.no-data {
    color: var(--text-secondary);
    background: rgba(15, 23, 42, 0.9);
  }
  .no-data-icon {
    font-size: 48px;
    opacity: 0.2;
  }
  .highlight {
    color: var(--accent);
    font-weight: 700;
  }
  .sub-text {
    font-size: 12px;
    opacity: 0.6;
  }

  @media (max-width: 640px) {
    .chart-watermark {
      font-size: 40px;
    }
  }
</style>
