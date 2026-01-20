import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';

function getAnchorIndex(candles: Candle[], params: IndicatorParams): number {
  if (params.anchorIso) {
    const anchorMs = Date.parse(params.anchorIso);
    if (Number.isFinite(anchorMs)) {
      const index = candles.findIndex((candle) => candle.timestamp >= anchorMs);
      if (index >= 0) {
        return index;
      }
    }
  }
  return 0;
}

export function calculateAnchoredVWAP(
  candles: Candle[],
  params: IndicatorParams
): IndicatorPoint[] {
  if (candles.length === 0) {
    return [];
  }

  const startIndex = getAnchorIndex(candles, params);
  if (startIndex >= candles.length) {
    return [];
  }

  let cumulativePV = 0;
  let cumulativeVolume = 0;
  const points: IndicatorPoint[] = [];

  for (let i = startIndex; i < candles.length; i += 1) {
    const candle = candles[i];
    const typicalPrice = (candle.high + candle.low + candle.close) / 3;
    cumulativePV += typicalPrice * candle.volume;
    cumulativeVolume += candle.volume;

    const value = cumulativeVolume === 0 ? typicalPrice : cumulativePV / cumulativeVolume;
    points.push({ timestamp: candle.timestamp, value });
  }

  return points;
}
