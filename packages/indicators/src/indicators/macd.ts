import type { Candle } from '@oss-charts/core';
import type { IndicatorPoint, IndicatorParams } from '../types';
import { getSourceValue, normalizeLength } from '../types';

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

type MACDParts = {
  macdLine: number[];
  signalLine: number[];
  startIndex: number;
  histogramOffset: number;
};

function computeMACDParts(candles: Candle[], params: IndicatorParams): MACDParts | null {
  const fastLength = normalizeLength(params.macdFast, 12);
  const slowLength = normalizeLength(params.macdSlow, 26);
  const signalLength = normalizeLength(params.macdSignal, 9);

  if (fastLength >= slowLength || candles.length < slowLength + signalLength) {
    return null;
  }

  const values = candles.map((candle) => getSourceValue(candle, params.source));
  const fastEMA = computeEMA(values, fastLength);
  const slowEMA = computeEMA(values, slowLength);

  const offset = slowLength - fastLength;
  const macdLine: number[] = [];
  for (let i = 0; i < slowEMA.length; i++) {
    macdLine.push(fastEMA[i + offset] - slowEMA[i]);
  }

  const signalLine = computeEMA(macdLine, signalLength);
  const histogramOffset = signalLength - 1;
  const startIndex = slowLength - 1 + histogramOffset;

  return { macdLine, signalLine, startIndex, histogramOffset };
}

export function calculateMACD(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const parts = computeMACDParts(candles, params);
  if (!parts) {
    return [];
  }

  const points: IndicatorPoint[] = [];

  for (let i = 0; i < parts.signalLine.length; i++) {
    const candleIndex = parts.startIndex + i;
    if (candleIndex >= candles.length) break;

    const macdValue = parts.macdLine[i + parts.histogramOffset];
    points.push({
      timestamp: candles[candleIndex].timestamp,
      value: macdValue
    });
  }

  return points;
}

export function calculateMACDSignal(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const parts = computeMACDParts(candles, params);
  if (!parts) {
    return [];
  }

  const points: IndicatorPoint[] = [];
  for (let i = 0; i < parts.signalLine.length; i++) {
    const candleIndex = parts.startIndex + i;
    if (candleIndex >= candles.length) break;

    points.push({
      timestamp: candles[candleIndex].timestamp,
      value: parts.signalLine[i]
    });
  }

  return points;
}

export function calculateMACDHistogram(candles: Candle[], params: IndicatorParams): IndicatorPoint[] {
  const parts = computeMACDParts(candles, params);
  if (!parts) {
    return [];
  }

  const points: IndicatorPoint[] = [];
  for (let i = 0; i < parts.signalLine.length; i++) {
    const candleIndex = parts.startIndex + i;
    if (candleIndex >= candles.length) break;

    const macdValue = parts.macdLine[i + parts.histogramOffset];
    const signalValue = parts.signalLine[i];
    points.push({
      timestamp: candles[candleIndex].timestamp,
      value: macdValue - signalValue
    });
  }

  return points;
}
