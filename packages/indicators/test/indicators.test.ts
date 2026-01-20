import { describe, expect, it } from 'vitest';
import type { Candle } from '@oss-charts/core';
import { calculateAnchoredVWAP, calculateEMA, calculateRSI, calculateSMA } from '../src/index';

function makeCandles(values: number[]): Candle[] {
  const base = Date.UTC(2024, 0, 2, 14, 30, 0, 0);
  return values.map((value, index) => ({
    timestamp: base + index * 60_000,
    open: value,
    high: value,
    low: value,
    close: value,
    volume: 1
  }));
}

describe('indicators', () => {
  it('calculates SMA', () => {
    const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const points = calculateSMA(candles, { length: 3, source: 'close' });
    const values = points.map((point) => point.value);
    expect(values).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('calculates EMA', () => {
    const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const points = calculateEMA(candles, { length: 3, source: 'close' });
    const values = points.map((point) => point.value);
    expect(values).toEqual([2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('calculates RSI', () => {
    const candles = makeCandles([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const points = calculateRSI(candles, { length: 3, source: 'close' });
    const values = points.map((point) => Math.round(point.value));
    expect(values).toEqual([100, 100, 100, 100, 100, 100, 100]);
  });

  it('calculates anchored VWAP', () => {
    const candles = makeCandles([10, 20, 30]);
    const points = calculateAnchoredVWAP(candles, { length: 1, source: 'close' });
    const values = points.map((point) => Number(point.value.toFixed(2)));
    expect(values).toEqual([10, 15, 20]);
  });
});
