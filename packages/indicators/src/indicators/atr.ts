import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';

function getTrueRange(candle: Candle, prevClose: number): number {
  const highLow = candle.high - candle.low;
  const highClose = Math.abs(candle.high - prevClose);
  const lowClose = Math.abs(candle.low - prevClose);
  return Math.max(highLow, highClose, lowClose);
}

export function calculateATR(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const length = Math.max(1, Math.floor(params.length));
  if (candles.length < length + 1) {
    return [];
  }

  const trueRanges: number[] = [];
  for (let i = 1; i < candles.length; i++) {
    trueRanges.push(getTrueRange(candles[i], candles[i - 1].close));
  }

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += trueRanges[i];
  }
  let atr = sum / length;

  const points: IndicatorPoint[] = [
    { timestamp: candles[length].timestamp, value: atr }
  ];

  for (let i = length; i < trueRanges.length; i++) {
    atr = (atr * (length - 1) + trueRanges[i]) / length;
    points.push({
      timestamp: candles[i + 1].timestamp,
      value: atr
    });
  }

  return points;
}
