import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';
import { getSourceValue, normalizeLength } from '../types';

function getRsiValue(avgGain: number, avgLoss: number): number {
  if (avgGain === 0 && avgLoss === 0) {
    return 50;
  }
  if (avgLoss === 0) {
    return 100;
  }
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calculateRSI(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const length = normalizeLength(params.length, 14);
  if (candles.length <= length) {
    return [];
  }

  const points: IndicatorPoint[] = [];
  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= length; i += 1) {
    const change =
      getSourceValue(candles[i], params.source) - getSourceValue(candles[i - 1], params.source);
    if (change >= 0) {
      gains += change;
    } else {
      losses += Math.abs(change);
    }
  }

  let avgGain = gains / length;
  let avgLoss = losses / length;

  points.push({
    timestamp: candles[length].timestamp,
    value: getRsiValue(avgGain, avgLoss)
  });

  for (let i = length + 1; i < candles.length; i += 1) {
    const change =
      getSourceValue(candles[i], params.source) - getSourceValue(candles[i - 1], params.source);
    const gain = change > 0 ? change : 0;
    const loss = change < 0 ? Math.abs(change) : 0;

    avgGain = (avgGain * (length - 1) + gain) / length;
    avgLoss = (avgLoss * (length - 1) + loss) / length;

    points.push({
      timestamp: candles[i].timestamp,
      value: getRsiValue(avgGain, avgLoss)
    });
  }

  return points;
}
