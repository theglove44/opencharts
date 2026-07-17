import type { Candle, Timeframe } from '@oss-charts/core';

const API_BASE = import.meta.env.VITE_API_URL?.trim() || '';
const MAX_CANDLES_PER_RESPONSE = 60_000;
const SYMBOL_PATTERN = /^[A-Z][A-Z0-9.-]{0,15}$/;

type CandleResponse = {
  symbol: string;
  timeframe: Timeframe;
  candles: Candle[];
};

type LatestResponse = {
  symbol: string;
  price: number;
  timestamp: number;
};

function browserOrigin() {
  return globalThis.location?.origin ?? 'http://localhost';
}

function createApiUrl(path: string) {
  const base = API_BASE || (import.meta.env.DEV ? 'http://localhost:3001' : '');
  const href = base ? `${base.replace(/\/+$/, '')}${path}` : path;
  return new URL(href, browserOrigin());
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function parseCandle(value: unknown): Candle | null {
  if (!value || typeof value !== 'object') {
    return null;
  }
  const candle = value as Partial<Candle>;
  if (
    !isFiniteNumber(candle.timestamp) ||
    !isFiniteNumber(candle.open) ||
    !isFiniteNumber(candle.high) ||
    !isFiniteNumber(candle.low) ||
    !isFiniteNumber(candle.close) ||
    !isFiniteNumber(candle.volume) ||
    candle.high < candle.low
  ) {
    return null;
  }
  return {
    timestamp: candle.timestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume
  };
}

function parseCandleResponse(value: unknown): CandleResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Malformed candle response');
  }
  const data = value as Partial<CandleResponse>;
  if (!Array.isArray(data.candles)) {
    throw new Error('Malformed candle response');
  }
  if (data.candles.length > MAX_CANDLES_PER_RESPONSE) {
    throw new Error('Too many candles returned');
  }
  const candles = data.candles.map(parseCandle);
  if (candles.some((candle) => candle === null)) {
    throw new Error('Malformed candle response');
  }
  return {
    symbol: typeof data.symbol === 'string' ? data.symbol : '',
    timeframe: data.timeframe as Timeframe,
    candles: candles as Candle[]
  };
}

function parseLatestResponse(value: unknown): LatestResponse {
  if (!value || typeof value !== 'object') {
    throw new Error('Malformed latest response');
  }
  const data = value as Partial<LatestResponse>;
  if (
    typeof data.symbol !== 'string' ||
    !isFiniteNumber(data.price) ||
    !isFiniteNumber(data.timestamp)
  ) {
    throw new Error('Malformed latest response');
  }
  return {
    symbol: data.symbol,
    price: data.price,
    timestamp: data.timestamp
  };
}

export async function fetchSymbols(): Promise<string[]> {
  const response = await fetch(createApiUrl('/symbols'));
  if (!response.ok) {
    return ['SPY'];
  }
  const data = await response.json();
  if (!Array.isArray(data)) {
    return ['SPY'];
  }
  const symbols = data.filter(
    (value): value is string => typeof value === 'string' && SYMBOL_PATTERN.test(value)
  );
  return symbols.length > 0 ? symbols : ['SPY'];
}

export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  from: Date,
  to: Date
): Promise<Candle[]> {
  const url = createApiUrl('/candles');
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('tf', timeframe);
  url.searchParams.set('from', from.toISOString());
  url.searchParams.set('to', to.toISOString());

  const response = await fetch(url.toString());
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to fetch candles');
  }

  const data = parseCandleResponse(await response.json());
  return data.candles;
}

export async function fetchLatestPrice(symbol: string): Promise<{ price: number; timestamp: number } | null> {
  const url = createApiUrl('/latest');
  url.searchParams.set('symbol', symbol);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }

  const data = parseLatestResponse(await response.json());
  return { price: data.price, timestamp: data.timestamp };
}
