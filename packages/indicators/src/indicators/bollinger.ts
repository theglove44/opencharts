import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';
import { getSourceValue } from '../types';

export function calculateBollinger(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const length = Math.max(1, Math.floor(params.length));
  const stdDevMult = params.stdDev ?? 2;

  if (candles.length < length) {
    return [];
  }

  const points: IndicatorPoint[] = [];

  for (let i = length - 1; i < candles.length; i++) {
    let sum = 0;
    const values: number[] = [];
    for (let j = i - length + 1; j <= i; j++) {
      const val = getSourceValue(candles[j], params.source);
      sum += val;
      values.push(val);
    }
    const sma = sum / length;

    let variance = 0;
    for (const val of values) {
      variance += (val - sma) ** 2;
    }
    const stdDev = Math.sqrt(variance / length);

    points.push({
      timestamp: candles[i].timestamp,
      value: sma,
      upper: sma + stdDevMult * stdDev,
      lower: sma - stdDevMult * stdDev
    });
  }

  return points;
}
