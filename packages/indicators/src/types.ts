import type { Candle, PriceSource } from '@oss-charts/core';

export const INDICATOR_TYPES = [
  'sma',
  'ema',
  'rsi',
  'vwap',
  'macd',
  'macdSignal',
  'macdHistogram',
  'bollinger',
  'volume',
  'volumeMA',
  'atr'
] as const;

export type IndicatorType = (typeof INDICATOR_TYPES)[number];

export type IndicatorPane = 'overlay' | 'separate';

export type IndicatorParams = {
  length: number;
  source: PriceSource;
  anchorIso?: string;
  macdFast?: number;
  macdSlow?: number;
  macdSignal?: number;
  stdDev?: number;
};

export type IndicatorInstance = {
  id: string;
  type: IndicatorType;
  params: IndicatorParams;
};

export type IndicatorPoint = {
  timestamp: number;
  value: number;
  [key: string]: number | undefined;
};

export type IndicatorCompute = (candles: Candle[], params: IndicatorParams) => IndicatorPoint[];

export type IndicatorDefinition = {
  type: IndicatorType;
  name: string;
  pane: IndicatorPane;
  defaultParams: IndicatorParams;
  lines?: string[];
  label: (params: IndicatorParams) => string;
  compute: IndicatorCompute;
};

export function getSourceValue(candle: Candle, source: PriceSource): number {
  switch (source) {
    case 'open':
      return candle.open;
    case 'high':
      return candle.high;
    case 'low':
      return candle.low;
    case 'close':
    default:
      return candle.close;
  }
}

export function isIndicatorType(value: unknown): value is IndicatorType {
  return typeof value === 'string' && INDICATOR_TYPES.includes(value as IndicatorType);
}

export function normalizeLength(value: unknown, fallback = 1): number {
  const numberValue = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numberValue) && numberValue > 0 ? Math.floor(numberValue) : fallback;
}
