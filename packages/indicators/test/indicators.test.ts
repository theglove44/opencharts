import { describe, expect, it } from 'vitest';
import type { Candle } from '@oss-charts/core';
import { calculateAnchoredVWAP, calculateEMA, calculateRSI, calculateSMA, calculateBollinger } from '../src/index';

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

  it('calculates Bollinger Bands', () => {
    const candles = makeCandles([10, 20, 30, 40, 50]);
    // length 3
    // i=2: [10, 20, 30] -> avg 20, var ((10-20)^2 + (20-20)^2 + (30-20)^2)/3 = (100+0+100)/3 = 66.66.. -> stdDev 8.16
    // middle: 20
    // upper: 20 + 2*8.16 = 36.32
    // lower: 20 - 2*8.16 = 3.68

    // i=3: [20, 30, 40] -> avg 30
    // middle: 30

    // i=4: [30, 40, 50] -> avg 40

    const points = calculateBollinger(candles, { length: 3, source: 'close', stdDev: 2 });
    expect(points.length).toBe(3);

    expect(points[0].value).toBeCloseTo(20);
    expect(points[0].upper).toBeCloseTo(36.33, 1);
    expect(points[0].lower).toBeCloseTo(3.67, 1);
  });
});
