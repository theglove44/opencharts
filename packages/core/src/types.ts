export type Timeframe = '1m' | '5m' | '10m' | '30m' | '60m' | '1d';

export const TIMEFRAMES: Timeframe[] = ['1m', '5m', '10m', '30m', '60m', '1d'];

export type PriceSource = 'open' | 'high' | 'low' | 'close';

export type Candle = {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export const timeframeToMinutes: Record<Exclude<Timeframe, '1d'>, number> = {
  '1m': 1,
  '5m': 5,
  '10m': 10,
  '30m': 30,
  '60m': 60
};
