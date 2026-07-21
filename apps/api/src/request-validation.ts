import { TIMEFRAMES, type Timeframe } from '@oss-charts/core';
import { SUPPORTED_SYMBOLS } from './providers/mock';

const DEFAULT_MAX_CANDLE_RANGE_DAYS = 120;
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,15}$/;
const MAX_LOOKBACK_DAYS: Record<Timeframe, number> = {
  '1m': 7,
  '5m': 30,
  '10m': 60,
  '30m': 90,
  '60m': 180,
  '1d': 5 * 365
};

export type DataMode = 'mock' | 'alpaca';

export type CandlesQuery = {
  symbol?: string;
  tf?: string;
  from?: string;
  to?: string;
};

export type ValidatedCandleQuery = {
  symbol: string;
  timeframe: Timeframe;
  fromMs: number;
  toMs: number;
};

function getEnvNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) {
    return fallback;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function getMaxCandleRangeMs(timeframe: Timeframe): number {
  return Math.min(
    getEnvNumber('MAX_CANDLE_RANGE_DAYS', DEFAULT_MAX_CANDLE_RANGE_DAYS) * DAY_MS,
    MAX_LOOKBACK_DAYS[timeframe] * DAY_MS
  );
}

export function normalizeDataMode(value = process.env.DATA_MODE): DataMode {
  return value?.toLowerCase() === 'alpaca' ? 'alpaca' : 'mock';
}

export function normalizeSymbol(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const symbol = value.trim().toUpperCase();
  return SYMBOL_PATTERN.test(symbol) ? symbol : null;
}

export function validateSymbol(value: unknown, dataMode: DataMode): string {
  const symbol = normalizeSymbol(value ?? 'SPY');
  if (!symbol) {
    throw new Error('Invalid symbol');
  }
  if (dataMode === 'mock' && !SUPPORTED_SYMBOLS.includes(symbol)) {
    throw new Error(`Unsupported symbol in mock mode. Supported: ${SUPPORTED_SYMBOLS.join(', ')}`);
  }
  return symbol;
}

export function validateTimeframe(value: unknown): Timeframe {
  const timeframe = typeof value === 'string' ? value : '5m';
  if (!TIMEFRAMES.includes(timeframe as Timeframe)) {
    throw new Error('Unsupported timeframe');
  }
  return timeframe as Timeframe;
}

export function defaultLookbackMs(_timeframe: Timeframe): number {
  void _timeframe;
  return 90 * DAY_MS;
}

export function validateCandleQuery(query: CandlesQuery, dataMode: DataMode): ValidatedCandleQuery {
  const symbol = validateSymbol(query.symbol, dataMode);
  const timeframe = validateTimeframe(query.tf);
  const toMs = query.to ? Date.parse(query.to) : Date.now();
  const fromMs = query.from ? Date.parse(query.from) : toMs - defaultLookbackMs(timeframe);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    throw new Error('Invalid time range');
  }

  const maxRangeMs = getMaxCandleRangeMs(timeframe);
  if (toMs - fromMs > maxRangeMs) {
    const maxDays = Math.round(maxRangeMs / DAY_MS);
    throw new Error(`Time range exceeds ${maxDays} days`);
  }

  return { symbol, timeframe, fromMs, toMs };
}
