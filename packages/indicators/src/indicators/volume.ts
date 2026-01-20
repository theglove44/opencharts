import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function calculateVolume(candles: Candle[], _params: IndicatorParams): IndicatorPoint[] {
  return candles.map((candle) => ({
    timestamp: candle.timestamp,
    value: candle.volume
  }));
}

export function calculateVolumeMA(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const length = Math.max(1, Math.floor(params.length));
  if (candles.length < length) {
    return [];
  }

  const points: IndicatorPoint[] = [];
  let sum = 0;

  for (let i = 0; i < candles.length; i++) {
    sum += candles[i].volume;

    if (i >= length) {
      sum -= candles[i - length].volume;
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
