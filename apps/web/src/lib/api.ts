import type { Candle, Timeframe } from '@oss-charts/core';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

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

export async function fetchSymbols(): Promise<string[]> {
  const response = await fetch(`${API_URL}/symbols`);
  if (!response.ok) {
    return ['SPY'];
  }
  return (await response.json()) as string[];
}

export async function fetchCandles(
  symbol: string,
  timeframe: Timeframe,
  from: Date,
  to: Date
): Promise<Candle[]> {
  const url = new URL(`${API_URL}/candles`);
  url.searchParams.set('symbol', symbol);
  url.searchParams.set('tf', timeframe);
  url.searchParams.set('from', from.toISOString());
  url.searchParams.set('to', to.toISOString());

  const response = await fetch(url.toString());
  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || 'Failed to fetch candles');
  }

  const data = (await response.json()) as CandleResponse;
  return data.candles;
}

export async function fetchLatestPrice(symbol: string): Promise<{ price: number; timestamp: number } | null> {
  const url = new URL(`${API_URL}/latest`);
  url.searchParams.set('symbol', symbol);

  const response = await fetch(url.toString());
  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as LatestResponse;
  return { price: data.price, timestamp: data.timestamp };
}
