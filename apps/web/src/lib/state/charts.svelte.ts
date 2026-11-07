import type { PriceSource, Timeframe } from '@oss-charts/core';
import { TIMEFRAMES } from '@oss-charts/core';
import {
  indicatorRegistry,
  type IndicatorInstance,
  type IndicatorParams,
  type IndicatorType,
  isIndicatorType,
} from '@oss-charts/indicators';
import type { Drawing, DrawingType } from '$lib/types/drawing';

export type LayoutType = 'single' | '1-2' | '2-1' | '2-2' | '1-3' | '3-1';

export interface ChartState {
  id: string;
  symbol: string;
  timeframe: Timeframe;
  indicators: IndicatorInstance[];
  drawings: Drawing[];
}

export interface Preset {
  name: string;
  indicators: IndicatorInstance[];
}

const STORAGE_KEY = 'oss-charts-state-v2';
const PRESETS_KEY = 'oss-charts-presets';

export const LAYOUT_TYPES: LayoutType[] = ['single', '1-2', '2-1', '2-2', '1-3', '3-1'];
export const PRICE_SOURCES = ['close', 'open', 'high', 'low'] as const;

const IMPLEMENTED_DRAWING_TYPES = ['trendline', 'horizontal_line', 'fibonacci'] as const;
const COLOR_PATTERN = /^#[0-9a-f]{3,8}$/i;

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
    ],
    drawings: [],
  };
}

// --- VALIDATION HELPERS ---

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function isTimeframe(value: unknown): value is Timeframe {
  return typeof value === 'string' && TIMEFRAMES.includes(value as Timeframe);
}

function isLayoutType(value: unknown): value is LayoutType {
  return typeof value === 'string' && LAYOUT_TYPES.includes(value as LayoutType);
}

function isPriceSource(value: unknown): value is PriceSource {
  return typeof value === 'string' && PRICE_SOURCES.includes(value as PriceSource);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positiveInteger(value: unknown, fallback: number): number {
  const numberValue = finiteNumber(value);
  return numberValue && numberValue > 0 ? Math.floor(numberValue) : fallback;
}

function sanitizeIndicator(value: unknown): IndicatorInstance | null {
  if (!isRecord(value) || !isIndicatorType(value.type)) {
    return null;
  }

  const def = indicatorRegistry[value.type];
  const rawParams = isRecord(value.params) ? value.params : {};
  const params: IndicatorParams = {
    ...def.defaultParams,
    source: isPriceSource(rawParams.source) ? rawParams.source : def.defaultParams.source,
    length: positiveInteger(rawParams.length, def.defaultParams.length),
  };

  if (typeof rawParams.anchorIso === 'string' && Number.isFinite(Date.parse(rawParams.anchorIso))) {
    params.anchorIso = rawParams.anchorIso;
  }
  if (finiteNumber(rawParams.macdFast)) params.macdFast = positiveInteger(rawParams.macdFast, 12);
  if (finiteNumber(rawParams.macdSlow)) params.macdSlow = positiveInteger(rawParams.macdSlow, 26);
  if (finiteNumber(rawParams.macdSignal))
    params.macdSignal = positiveInteger(rawParams.macdSignal, 9);
  if (finiteNumber(rawParams.stdDev)) params.stdDev = Math.max(0.1, rawParams.stdDev as number);

  return {
    id: typeof value.id === 'string' && value.id.length <= 80 ? value.id : createId(),
    type: value.type,
    params,
  };
}

function sanitizeDrawing(value: unknown): Drawing | null {
  if (!isRecord(value) || typeof value.type !== 'string') {
    return null;
  }
  if (!IMPLEMENTED_DRAWING_TYPES.includes(value.type as (typeof IMPLEMENTED_DRAWING_TYPES)[number])) {
    return null;
  }

  const points = Array.isArray(value.points)
    ? value.points
        .map((point) => {
          if (!isRecord(point)) return null;
          const timestamp = finiteNumber(point.timestamp);
          const price = finiteNumber(point.price);
          return timestamp !== null && price !== null ? { timestamp, price } : null;
        })
        .filter((point): point is { timestamp: number; price: number } => point !== null)
        .slice(0, 2)
    : [];

  if (points.length === 0) {
    return null;
  }

  const properties = isRecord(value.properties) ? value.properties : {};
  const fibLevels = Array.isArray(properties.fibLevels)
    ? properties.fibLevels
        .filter((level): level is number => typeof level === 'number' && Number.isFinite(level))
        .slice(0, 12)
    : undefined;

  return {
    id: typeof value.id === 'string' && value.id.length <= 80 ? value.id : createId(),
    type: value.type as DrawingType,
    points,
    properties: {
      color:
        typeof properties.color === 'string' && COLOR_PATTERN.test(properties.color)
          ? properties.color
          : '#38bdf8',
      lineWidth: Math.min(8, positiveInteger(properties.lineWidth, 2)),
      lineStyle:
        properties.lineStyle === 'dashed' || properties.lineStyle === 'dotted'
          ? properties.lineStyle
          : 'solid',
      fibLevels,
    },
  };
}

function sanitizeChartState(value: unknown): ChartState | null {
  if (!isRecord(value)) {
    return null;
  }
  const indicators = Array.isArray(value.indicators)
    ? value.indicators
        .map(sanitizeIndicator)
        .filter((item): item is IndicatorInstance => item !== null)
    : [];
  const drawings = Array.isArray(value.drawings)
    ? value.drawings.map(sanitizeDrawing).filter((item): item is Drawing => item !== null)
    : [];

  return {
    id: typeof value.id === 'string' && value.id.length <= 80 ? value.id : createId(),
    symbol: typeof value.symbol === 'string' ? value.symbol.slice(0, 16).toUpperCase() : 'SPY',
    timeframe: isTimeframe(value.timeframe) ? value.timeframe : '5m',
    indicators,
    drawings,
  };
}

// --- REACTIVE STATE ---

const state = $state({
  layout: 'single' as LayoutType,
  charts: [] as ChartState[],
  activeChartId: '',
  syncSymbol: false,
  savedPresets: [] as Preset[],
});

function layoutTargetCount(layout: LayoutType): number {
  switch (layout) {
    case '1-2':
    case '2-1':
      return 2;
    case '1-3':
    case '3-1':
      return 3;
    case '2-2':
      return 4;
    default:
      return 1;
  }
}

function persist() {
  try {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        layout: state.layout,
        charts: state.charts,
        activeChartId: state.activeChartId,
        syncSymbol: state.syncSymbol,
      }),
    );
  } catch (err) {
    console.warn('Failed to save state', err);
  }
}

function syncUrl() {
  if (typeof window === 'undefined') return;
  const url = new URL(window.location.href);
  const active = state.charts.find((c) => c.id === state.activeChartId);
  url.searchParams.set('s', active?.symbol ?? 'SPY');
  url.searchParams.set('tf', active?.timeframe ?? '5m');
  url.searchParams.set('layout', state.layout);
  window.history.replaceState(null, '', url.toString());
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      state.charts = [createChartState()];
      state.activeChartId = state.charts[0].id;
      return;
    }

    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed) && Array.isArray(parsed.charts)) {
      const loadedCharts = parsed.charts
        .map(sanitizeChartState)
        .filter((chart): chart is ChartState => chart !== null);
      state.charts = loadedCharts.length > 0 ? loadedCharts : [createChartState()];
      state.layout = isLayoutType(parsed.layout) ? parsed.layout : 'single';
      state.activeChartId =
        typeof parsed.activeChartId === 'string' ? parsed.activeChartId : state.charts[0]?.id;
      state.syncSymbol = parsed.syncSymbol === true;
    } else {
      // Old single-chart format migration
      const migrated = sanitizeChartState(parsed);
      state.charts = [migrated ?? createChartState()];
      state.activeChartId = state.charts[0].id;
    }

    if (!state.charts.find((c) => c.id === state.activeChartId)) {
      state.activeChartId = state.charts[0]?.id;
    }
  } catch (err) {
    console.warn('Failed to load state', err);
    state.charts = [createChartState()];
    state.activeChartId = state.charts[0].id;
  }
}

function loadPresets() {
  try {
    const raw = localStorage.getItem(PRESETS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    state.savedPresets = Array.isArray(parsed)
      ? parsed
          .filter((preset): preset is Record<string, unknown> => isRecord(preset))
          .map((preset) => ({
            name: typeof preset.name === 'string' ? preset.name.slice(0, 80) : '',
            indicators: Array.isArray(preset.indicators)
              ? preset.indicators
                  .map(sanitizeIndicator)
                  .filter((indicator): indicator is IndicatorInstance => indicator !== null)
              : [],
          }))
          .filter((preset) => preset.name.length > 0)
      : [];
  } catch {
    state.savedPresets = [];
  }
}

function savePresets() {
  localStorage.setItem(PRESETS_KEY, JSON.stringify(state.savedPresets));
}

interface UrlOverrides {
  symbol?: string;
  timeframe?: Timeframe;
  layout?: LayoutType;
}

function readUrlOverrides(): UrlOverrides {
  if (typeof window === 'undefined') return {};
  const params = new URLSearchParams(window.location.search);
  const overrides: UrlOverrides = {};

  const symbol = params.get('s');
  if (symbol) overrides.symbol = symbol.slice(0, 16).toUpperCase();

  const timeframe = params.get('tf');
  if (isTimeframe(timeframe)) overrides.timeframe = timeframe;

  const layout = params.get('layout');
  if (isLayoutType(layout)) overrides.layout = layout;

  return overrides;
}

function updateChartsForLayout(newLayout: LayoutType) {
  const targetCount = layoutTargetCount(newLayout);

  if (state.charts.length < targetCount) {
    const needed = targetCount - state.charts.length;
    const base =
      state.charts.find((c) => c.id === state.activeChartId) ?? state.charts[state.charts.length - 1];
    for (let i = 0; i < needed; i++) {
      state.charts = [...state.charts, { ...structuredClone(base), id: createId() }];
    }
  } else if (state.charts.length > targetCount) {
    state.charts = state.charts.slice(0, targetCount);
    if (!state.charts.find((c) => c.id === state.activeChartId)) {
      state.activeChartId = state.charts[0].id;
    }
  }
}

// --- PUBLIC STORE API ---

export const chartStore = {
  get layout(): LayoutType {
    return state.layout;
  },
  get charts(): ChartState[] {
    return state.charts;
  },
  get activeChartId(): string {
    return state.activeChartId;
  },
  get syncSymbol(): boolean {
    return state.syncSymbol;
  },
  get savedPresets(): Preset[] {
    return state.savedPresets;
  },
  get activeChart(): ChartState | undefined {
    return state.charts.find((c) => c.id === state.activeChartId) ?? state.charts[0];
  },
  get activeSymbol(): string {
    return this.activeChart?.symbol || 'SPY';
  },
  get activeTimeframe(): Timeframe {
    return this.activeChart?.timeframe || '5m';
  },

  init() {
    loadState();
    loadPresets();

    // URL params take precedence over localStorage so shared links work.
    const overrides = readUrlOverrides();
    if (overrides.symbol) {
      state.charts = state.charts.map((c) =>
        state.syncSymbol || c.id === state.activeChartId ? { ...c, symbol: overrides.symbol! } : c,
      );
    }
    if (overrides.timeframe) {
      state.charts = state.charts.map((c) =>
        c.id === state.activeChartId ? { ...c, timeframe: overrides.timeframe! } : c,
      );
    }
    if (overrides.layout) {
      state.layout = overrides.layout;
      updateChartsForLayout(state.layout);
    }

    if (state.charts.length === 0) {
      state.charts = [createChartState()];
      state.activeChartId = state.charts[0].id;
    }
    if (!state.charts.find((c) => c.id === state.activeChartId)) {
      state.activeChartId = state.charts[0]?.id;
    }

    syncUrl();
  },

  setActiveChart(id: string) {
    state.activeChartId = id;
    persist();
    syncUrl();
  },

  setSymbol(next: string) {
    const normalized = next.slice(0, 16).toUpperCase();
    state.charts = state.charts.map((c) =>
      state.syncSymbol || c.id === state.activeChartId ? { ...c, symbol: normalized } : c,
    );
    persist();
    syncUrl();
  },

  setTimeframe(next: Timeframe) {
    state.charts = state.charts.map((c) =>
      c.id === state.activeChartId ? { ...c, timeframe: next } : c,
    );
    persist();
    syncUrl();
  },

  setSyncSymbol(next: boolean) {
    state.syncSymbol = next;
    persist();
  },

  setLayout(next: LayoutType) {
    state.layout = next;
    updateChartsForLayout(next);
    persist();
    syncUrl();
  },

  addIndicator(type: IndicatorType) {
    const def = indicatorRegistry[type];
    if (!def || !state.activeChartId) return;
    const newIndicator: IndicatorInstance = {
      id: createId(),
      type: def.type,
      params: { ...def.defaultParams },
    };
    state.charts = state.charts.map((c) =>
      c.id === state.activeChartId ? { ...c, indicators: [...c.indicators, newIndicator] } : c,
    );
    persist();
  },

  removeIndicator(indicatorId: string) {
    state.charts = state.charts.map((c) =>
      c.id === state.activeChartId
        ? { ...c, indicators: c.indicators.filter((i) => i.id !== indicatorId) }
        : c,
    );
    persist();
  },

  updateIndicator(indicatorId: string, updater: (indicator: IndicatorInstance) => IndicatorInstance) {
    state.charts = state.charts.map((c) =>
      c.id === state.activeChartId
        ? { ...c, indicators: c.indicators.map((i) => (i.id === indicatorId ? updater(i) : i)) }
        : c,
    );
    persist();
  },

  saveCurrentAsPreset(name: string) {
    const trimmed = name.trim();
    const active = this.activeChart;
    if (!trimmed || !active) return;

    const preset: Preset = {
      name: trimmed,
      indicators: active.indicators.map((indicator) => ({
        ...indicator,
        id: createId(),
        params: { ...indicator.params },
      })),
    };

    const existing = state.savedPresets.findIndex((p) => p.name === trimmed);
    if (existing >= 0) state.savedPresets[existing] = preset;
    else state.savedPresets = [...state.savedPresets, preset];

    savePresets();
  },

  applyPreset(preset: Preset) {
    if (!state.activeChartId) return;
    const newIndicators = preset.indicators.map((i) => ({
      ...i,
      id: createId(),
      params: { ...i.params },
    }));
    state.charts = state.charts.map((c) =>
      c.id === state.activeChartId ? { ...c, indicators: newIndicators } : c,
    );
    persist();
  },

  deletePreset(name: string) {
    state.savedPresets = state.savedPresets.filter((p) => p.name !== name);
    savePresets();
  },

  addDrawing(chartId: string, drawing: Drawing) {
    state.charts = state.charts.map((c) =>
      c.id === chartId ? { ...c, drawings: [...c.drawings, drawing] } : c,
    );
    persist();
  },

  removeDrawing(chartId: string, drawingId: string) {
    state.charts = state.charts.map((c) =>
      c.id === chartId ? { ...c, drawings: c.drawings.filter((d) => d.id !== drawingId) } : c,
    );
    persist();
  },
};
