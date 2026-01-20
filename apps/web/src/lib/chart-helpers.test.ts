import { describe, expect, it } from 'vitest';
import type { Candle } from '@oss-charts/core';
import {
  getLookbackMs,
  getTimeframeMs,
  toCandlestickData,
  toCandlestickPoint,
  toLineData
} from './chart-helpers';

describe('chart helpers', () => {
  it('returns timeframe durations', () => {
    expect(getTimeframeMs('1m')).toBe(60_000);
    expect(getTimeframeMs('5m')).toBe(300_000);
    expect(getTimeframeMs('1d')).toBe(390 * 60_000);
  });

  it('returns a fixed lookback window', () => {
    expect(getLookbackMs('5m')).toBe(90 * 24 * 60 * 60_000);
  });

  it('maps candlestick data to chart points', () => {
    const candle: Candle = {
      timestamp: 1_000_000,
      open: 10,
      high: 12,
      low: 8,
      close: 11,
      volume: 100
    };

    expect(toCandlestickPoint(candle)).toEqual({
      time: 1000,
      open: 10,
      high: 12,
      low: 8,
      close: 11
    });

    expect(toCandlestickData([candle])).toEqual([
      {
        time: 1000,
        open: 10,
        high: 12,
        low: 8,
        close: 11
      }
    ]);
  });

  it('filters invalid line data points', () => {
    const points = toLineData([
      { timestamp: 1_000, value: 5 },
      { timestamp: Number.NaN, value: 7 },
      { timestamp: 2_000, value: Number.NaN },
      { timestamp: 3_000, value: 9 }
    ]);

    expect(points).toEqual([
      { time: 1, value: 5 },
      { time: 3, value: 9 }
    ]);
  });
});
