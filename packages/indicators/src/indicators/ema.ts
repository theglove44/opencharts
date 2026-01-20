import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';
import { getSourceValue } from '../types';

export function calculateEMA(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const length = Math.max(1, Math.floor(params.length));
  if (candles.length < length) {
    return [];
  }

  const points: IndicatorPoint[] = [];
  const alpha = 2 / (length + 1);

  let sum = 0;
  for (let i = 0; i < length; i += 1) {
    sum += getSourceValue(candles[i], params.source);
  }
  let ema = sum / length;
  points.push({ timestamp: candles[length - 1].timestamp, value: ema });

  for (let i = length; i < candles.length; i += 1) {
    const value = getSourceValue(candles[i], params.source);
    ema = value * alpha + ema * (1 - alpha);
    points.push({ timestamp: candles[i].timestamp, value: ema });
  }

  return points;
}
