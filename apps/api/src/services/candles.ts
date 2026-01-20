import type { Candle, Timeframe } from '@oss-charts/core';
import { resampleCandles } from '@oss-charts/core';
import type { CandleStore } from '../db';
import { fetchAlpacaCandles, fetchAlpacaLatestTrade } from '../providers/alpaca';
import { getMockCandles, getMockLatestTrade } from '../providers/mock';

const MINUTE_MS = 60_000;

type CandleService = {
  getCandles: (
    symbol: string,
    timeframe: Timeframe,
    fromMs: number,
    toMs: number
  ) => Promise<Candle[]>;
  getLatestTrade: (symbol: string) => Promise<{ price: number; timestamp: number } | null>;
};

function getMode(): 'alpaca' | 'mock' {
  const mode = (process.env.DATA_MODE || 'mock').toLowerCase();
  return mode === 'alpaca' ? 'alpaca' : 'mock';
}

type CandleServiceOptions = {
  getLatestTrade?: (symbol: string) => Promise<{ price: number; timestamp: number } | null>;
};

export function createCandleService(
  store: CandleStore,
  options: CandleServiceOptions = {}
): CandleService {
  const { getLatestTrade: getLatestTradeOverride } = options;
  async function getOneMinuteCandles(
    symbol: string,
    fromMs: number,
    toMs: number
  ): Promise<Candle[]> {
    if (getMode() === 'mock') {
      return getMockCandles(symbol, fromMs, toMs);
    }

    const cached = store.getCandles(symbol, fromMs, toMs);
    const hasCoverage =
      cached.length > 0 &&
      cached[0].timestamp <= fromMs &&
      cached[cached.length - 1].timestamp >= toMs - MINUTE_MS;

    if (hasCoverage) {
      return cached;
    }

    const fetched = await fetchAlpacaCandles(symbol, fromMs, toMs);
    if (fetched.length > 0) {
      store.insertCandles(symbol, fetched);
    }

    return store.getCandles(symbol, fromMs, toMs);
  }

  async function getCandles(
    symbol: string,
    timeframe: Timeframe,
    fromMs: number,
    toMs: number
  ): Promise<Candle[]> {
    const candles = await getOneMinuteCandles(symbol, fromMs, toMs);
    if (timeframe === '1m') {
      return candles;
    }
    return resampleCandles(candles, timeframe);
  }

  async function getLatestTrade(symbol: string) {
    if (getMode() === 'mock') {
      return getMockLatestTrade(symbol);
    }
    if (getLatestTradeOverride) {
      const latest = await getLatestTradeOverride(symbol);
      if (latest) {
        return latest;
      }
    }
    return fetchAlpacaLatestTrade(symbol);
  }

  return { getCandles, getLatestTrade };
}
