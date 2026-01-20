import { Candle, Timeframe, timeframeToMinutes } from './types';
import { getSessionStartMs, isRegularSessionMinute } from './session';

const MINUTE_MS = 60_000;

type CandleBucket = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  hasOpen: boolean;
};

function pushCandle(bucket: CandleBucket, candle: Candle) {
  if (!bucket.hasOpen) {
    bucket.open = candle.open;
    bucket.high = candle.high;
    bucket.low = candle.low;
    bucket.close = candle.close;
    bucket.volume = candle.volume;
    bucket.hasOpen = true;
    return;
  }
  bucket.high = Math.max(bucket.high, candle.high);
  bucket.low = Math.min(bucket.low, candle.low);
  bucket.close = candle.close;
  bucket.volume += candle.volume;
}

function finalizeBuckets(buckets: Map<number, CandleBucket>): Candle[] {
  return Array.from(buckets.values())
    .filter((bucket) => bucket.hasOpen)
    .sort((a, b) => a.timestamp - b.timestamp)
    .map((bucket) => ({
      timestamp: bucket.timestamp,
      open: bucket.open,
      high: bucket.high,
      low: bucket.low,
      close: bucket.close,
      volume: bucket.volume
    }));
}

function resampleIntraday(candles: Candle[], minutes: number): Candle[] {
  const buckets = new Map<number, CandleBucket>();
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  for (const candle of sorted) {
    const bucketStart =
      Math.floor(candle.timestamp / MINUTE_MS / minutes) * minutes * MINUTE_MS;
    let bucket = buckets.get(bucketStart);
    if (!bucket) {
      bucket = {
        timestamp: bucketStart,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        hasOpen: false
      };
      buckets.set(bucketStart, bucket);
    }
    pushCandle(bucket, candle);
  }
  return finalizeBuckets(buckets);
}

function resampleDaily(candles: Candle[]): Candle[] {
  const buckets = new Map<number, CandleBucket>();
  const sorted = [...candles].sort((a, b) => a.timestamp - b.timestamp);
  for (const candle of sorted) {
    if (!isRegularSessionMinute(candle.timestamp)) {
      continue;
    }
    const bucketStart = getSessionStartMs(candle.timestamp);
    let bucket = buckets.get(bucketStart);
    if (!bucket) {
      bucket = {
        timestamp: bucketStart,
        open: 0,
        high: 0,
        low: 0,
        close: 0,
        volume: 0,
        hasOpen: false
      };
      buckets.set(bucketStart, bucket);
    }
    pushCandle(bucket, candle);
  }
  return finalizeBuckets(buckets);
}

export function resampleCandles(candles: Candle[], timeframe: Timeframe): Candle[] {
  if (timeframe === '1m') {
    return [...candles].sort((a, b) => a.timestamp - b.timestamp);
  }
  if (timeframe === '1d') {
    return resampleDaily(candles);
  }
  const minutes = timeframeToMinutes[timeframe];
  return resampleIntraday(candles, minutes);
}
