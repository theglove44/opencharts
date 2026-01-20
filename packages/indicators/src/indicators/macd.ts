import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';
import { getSourceValue } from '../types';

export type MACDResult = {
  macd: IndicatorPoint[];
  signal: IndicatorPoint[];
  histogram: IndicatorPoint[];
};

function computeEMA(values: number[], length: number): number[] {
  if (values.length < length) return [];

  const alpha = 2 / (length + 1);
  const result: number[] = [];

  let sum = 0;
  for (let i = 0; i < length; i++) {
    sum += values[i];
  }
  let ema = sum / length;
  result.push(ema);

  for (let i = length; i < values.length; i++) {
    ema = values[i] * alpha + ema * (1 - alpha);
    result.push(ema);
  }

  return result;
}

export function calculateMACD(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const fastLength = params.macdFast ?? 12;
  const slowLength = params.macdSlow ?? 26;
  const signalLength = params.macdSignal ?? 9;

  if (candles.length < slowLength + signalLength) {
    return [];
  }

  const values = candles.map((c) => getSourceValue(c, params.source));
  const fastEMA = computeEMA(values, fastLength);
  const slowEMA = computeEMA(values, slowLength);

  const offset = slowLength - fastLength;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push(fastEMA[i + offset] - slowEMA[i]);
  }

  const signalLine = computeEMA(macdLine, signalLength);
  const histogramOffset = signalLength - 1;

  const points: IndicatorPoint[] = [];
  const startIndex = slowLength - 1 + signalLength - 1;

  for (let i = 0; i < signalLine.length; i++) {
    const candleIndex = startIndex + i;
    if (candleIndex >= candles.length) break;

    const macdValue = macdLine[i + histogramOffset];
    points.push({
      timestamp: candles[candleIndex].timestamp,
      value: macdValue
    });
  }

  return points;
}

export function calculateMACDSignal(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const fastLength = params.macdFast ?? 12;
  const slowLength = params.macdSlow ?? 26;
  const signalLength = params.macdSignal ?? 9;

  if (candles.length < slowLength + signalLength) {
    return [];
  }

  const values = candles.map((c) => getSourceValue(c, params.source));
  const fastEMA = computeEMA(values, fastLength);
  const slowEMA = computeEMA(values, slowLength);

  const offset = slowLength - fastLength;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push(fastEMA[i + offset] - slowEMA[i]);
  }

  const signalLine = computeEMA(macdLine, signalLength);
  const startIndex = slowLength - 1 + signalLength - 1;

  const points: IndicatorPoint[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    const candleIndex = startIndex + i;
    if (candleIndex >= candles.length) break;

    points.push({
      timestamp: candles[candleIndex].timestamp,
      value: signalLine[i]
    });
  }

  return points;
}

export function calculateMACDHistogram(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const fastLength = params.macdFast ?? 12;
  const slowLength = params.macdSlow ?? 26;
  const signalLength = params.macdSignal ?? 9;

  if (candles.length < slowLength + signalLength) {
    return [];
  }

  const values = candles.map((c) => getSourceValue(c, params.source));
  const fastEMA = computeEMA(values, fastLength);
  const slowEMA = computeEMA(values, slowLength);

  const offset = slowLength - fastLength;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push(fastEMA[i + offset] - slowEMA[i]);
  }

  const signalLine = computeEMA(macdLine, signalLength);
  const histogramOffset = signalLength - 1;
  const startIndex = slowLength - 1 + signalLength - 1;

  const points: IndicatorPoint[] = [];
  for (let i = 0; i < signalLine.length; i++) {
    const candleIndex = startIndex + i;
    if (candleIndex >= candles.length) break;

    const macdValue = macdLine[i + histogramOffset];
    const signalValue = signalLine[i];
    points.push({
      timestamp: candles[candleIndex].timestamp,
      value: macdValue - signalValue
    });
  }

  return points;
}
