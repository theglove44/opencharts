import { describe, expect, it } from 'vitest';
import { resampleCandles } from '../src/resample';
import { Candle } from '../src/types';

const base = Date.UTC(2024, 0, 2, 14, 30, 0, 0);

function makeCandle(offsetMinutes: number, values: Partial<Candle>): Candle {
  return {
    timestamp: base + offsetMinutes * 60_000,
    open: 100,
    high: 100,
    low: 100,
    close: 100,
    volume: 1,
    ...values
  };
}

describe('resampleCandles', () => {
  it('aggregates intraday buckets', () => {
    const candles: Candle[] = [
      makeCandle(0, { open: 100, high: 101, low: 99, close: 100.5, volume: 10 }),
      makeCandle(1, { open: 100.5, high: 102, low: 100, close: 101, volume: 11 }),
      makeCandle(2, { open: 101, high: 103, low: 100.5, close: 102, volume: 12 }),
      makeCandle(3, { open: 102, high: 102.5, low: 101.5, close: 102.2, volume: 13 }),
      makeCandle(4, { open: 102.2, high: 103.2, low: 101.8, close: 102.8, volume: 14 })
    ];

    const resampled = resampleCandles(candles, '5m');

    expect(resampled).toHaveLength(1);
    expect(resampled[0]).toEqual({
      timestamp: base,
      open: 100,
      high: 103.2,
      low: 99,
      close: 102.8,
      volume: 60
    });
  });

  it('aggregates daily buckets on NY session start', () => {
    const day1 = Date.UTC(2024, 0, 2, 14, 30, 0, 0);
    const day2 = Date.UTC(2024, 0, 3, 14, 30, 0, 0);

    const candles: Candle[] = [
      {
        timestamp: day1,
        open: 100,
        high: 101,
        low: 99,
        close: 100.5,
        volume: 10
      },
      {
        timestamp: day1 + 60_000,
        open: 100.5,
        high: 102,
        low: 100,
        close: 101,
        volume: 11
      },
      {
        timestamp: day2,
        open: 102,
        high: 103,
        low: 101,
        close: 102.5,
        volume: 12
      },
      {
        timestamp: day2 + 60_000,
        open: 102.5,
        high: 104,
        low: 102,
        close: 103,
        volume: 13
      }
    ];

    const resampled = resampleCandles(candles, '1d');

    expect(resampled).toHaveLength(2);
    expect(resampled[0].timestamp).toBe(day1);
    expect(resampled[0].open).toBe(100);
    expect(resampled[0].close).toBe(101);
    expect(resampled[1].timestamp).toBe(day2);
    expect(resampled[1].open).toBe(102);
    expect(resampled[1].close).toBe(103);
  });
});
