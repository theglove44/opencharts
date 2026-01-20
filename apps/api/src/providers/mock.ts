import fs from 'node:fs';
import path from 'node:path';
import type { Candle } from '@oss-charts/core';

const cwd = process.cwd();
const workspaceDataDir = path.resolve(cwd, 'apps/api/data');
const dataDir = fs.existsSync(workspaceDataDir) ? workspaceDataDir : path.resolve(cwd, 'data');
const MOCK_PATH = path.resolve(dataDir, 'mock-candles.json');

export const SUPPORTED_SYMBOLS = ['SPY', 'QQQ', 'IWM', 'DIA', 'AAPL', 'MSFT', 'GOOGL', 'AMZN', 'NVDA', 'TSLA'];

const symbolMultipliers: Record<string, { base: number; volatility: number }> = {
  SPY: { base: 1, volatility: 1 },
  QQQ: { base: 0.85, volatility: 1.2 },
  IWM: { base: 0.42, volatility: 1.3 },
  DIA: { base: 0.76, volatility: 0.9 },
  AAPL: { base: 0.38, volatility: 1.5 },
  MSFT: { base: 0.82, volatility: 1.4 },
  GOOGL: { base: 0.30, volatility: 1.6 },
  AMZN: { base: 0.38, volatility: 1.7 },
  NVDA: { base: 0.25, volatility: 2.2 },
  TSLA: { base: 0.52, volatility: 2.5 }
};

let cached: Candle[] | null = null;

function loadMockCandles(): Candle[] {
  if (cached) {
    return cached;
  }
  const raw = fs.readFileSync(MOCK_PATH, 'utf-8');
  const data = JSON.parse(raw) as Candle[];
  cached = data.sort((a, b) => a.timestamp - b.timestamp);
  return cached;
}

function transformForSymbol(candles: Candle[], symbol: string): Candle[] {
  const config = symbolMultipliers[symbol] || { base: 1, volatility: 1 };
  return candles.map((c) => {
    const mid = (c.open + c.close) / 2;
    const range = c.high - c.low;
    const newMid = mid * config.base;
    const newRange = range * config.volatility * config.base;
    return {
      timestamp: c.timestamp,
      open: c.open * config.base,
      high: newMid + newRange / 2,
      low: newMid - newRange / 2,
      close: c.close * config.base,
      volume: Math.round(c.volume * (1 + Math.random() * 0.5))
    };
  });
}

export function getMockCandles(symbol: string, fromMs: number, toMs: number): Candle[] {
  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    return [];
  }
  const data = loadMockCandles();
  let filtered = data.filter((candle) => candle.timestamp >= fromMs && candle.timestamp <= toMs);
  if (filtered.length === 0) {
    const fallbackCount = Math.min(600, data.length);
    filtered = data.slice(data.length - fallbackCount);
  }
  return transformForSymbol(filtered, symbol);
}

export function getMockLatestTrade(symbol: string): { price: number; timestamp: number } | null {
  if (!SUPPORTED_SYMBOLS.includes(symbol)) {
    return null;
  }
  const data = loadMockCandles();
  const last = data[data.length - 1];
  if (!last) {
    return null;
  }
  const config = symbolMultipliers[symbol] || { base: 1, volatility: 1 };
  return { price: last.close * config.base, timestamp: last.timestamp };
}
