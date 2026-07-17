import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';
import { normalizeLength } from '../types';

export function calculateVolume(candles: Candle[], _params: IndicatorParams): IndicatorPoint[] {
  void _params;
  return candles.map((candle) => ({
    timestamp: candle.timestamp,
    value: candle.volume
  }));
}

export function calculateVolumeMA(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const length = normalizeLength(params.length);
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
