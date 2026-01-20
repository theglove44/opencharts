import type { Candle, Timeframe } from '@oss-charts/core';
import type { UTCTimestamp } from 'lightweight-charts';

type LinePoint = { timestamp: number; value: number };

type LineSeriesPoint = { time: UTCTimestamp; value: number };

const LOOKBACK_DAYS = 90;
const ONE_MINUTE_MS = 60_000;

export function getLookbackMs(_: Timeframe) {
  return LOOKBACK_DAYS * 24 * 60 * ONE_MINUTE_MS;
}

export function getTimeframeMs(timeframe: Timeframe) {
  switch (timeframe) {
    case '1m':
      return ONE_MINUTE_MS;
    case '5m':
      return 5 * ONE_MINUTE_MS;
    case '10m':
      return 10 * ONE_MINUTE_MS;
    case '30m':
      return 30 * ONE_MINUTE_MS;
    case '60m':
      return 60 * ONE_MINUTE_MS;
    case '1d':
    default:
      return 390 * ONE_MINUTE_MS;
  }
}

export function toCandlestickData(data: Candle[]) {
  return data.map((candle) => toCandlestickPoint(candle));
}

export function toLineData(data: LinePoint[]): LineSeriesPoint[] {
  return data
    .map((point) => {
      const time = Math.floor(point.timestamp / 1000);
      if (!Number.isFinite(time) || !Number.isFinite(point.value)) {
        return null;
      }
      return {
        time: time as UTCTimestamp,
        value: point.value
      };
    })
    .filter((point): point is LineSeriesPoint => point !== null);
}

export function toCandlestickPoint(candle: Candle) {
  return {
    time: Math.floor(candle.timestamp / 1000) as UTCTimestamp,
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close
  };
}

export function toLocalInputValue(timestampMs: number) {
  const date = new Date(timestampMs);
  const pad = (value: number) => value.toString().padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours()
  )}:${pad(date.getMinutes())}`;
}

export function formatTimestamp(timestamp: number) {
  return new Date(timestamp).toLocaleString();
}
