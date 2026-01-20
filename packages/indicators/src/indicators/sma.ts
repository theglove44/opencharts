import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';
import { getSourceValue } from '../types';

export function calculateSMA(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const length = Math.max(1, Math.floor(params.length));
  if (candles.length < length) {
    return [];
  }

  const points: IndicatorPoint[] = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i += 1) {
    const value = getSourceValue(candles[i], params.source);
    sum += value;

    if (i >= length) {
      const removed = getSourceValue(candles[i - length], params.source);
      sum -= removed;
    }

    if (i >= length - 1) {
      points.push({
        timestamp: candles[i].timestamp,
        value: sum / length
      });
    }
  }

  return points;
}
