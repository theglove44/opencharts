import type { IndicatorDefinition, IndicatorType } from './types';
import { calculateEMA } from './indicators/ema';
import { calculateRSI } from './indicators/rsi';
import { calculateSMA } from './indicators/sma';
import { calculateAnchoredVWAP } from './indicators/vwap';
import { calculateMACD, calculateMACDSignal, calculateMACDHistogram } from './indicators/macd';
import { calculateBollingerUpper, calculateBollingerMiddle, calculateBollingerLower } from './indicators/bollinger';
import { calculateVolume, calculateVolumeMA } from './indicators/volume';
import { calculateATR } from './indicators/atr';

export const indicatorRegistry: Record<IndicatorType, IndicatorDefinition> = {
  sma: {
    type: 'sma',
    name: 'SMA',
    pane: 'overlay',
    defaultParams: { length: 20, source: 'close' },
    label: (params) => `SMA(${params.length}) ${params.source}`,
    compute: calculateSMA
  },
  ema: {
    type: 'ema',
    name: 'EMA',
    pane: 'overlay',
    defaultParams: { length: 20, source: 'close' },
    label: (params) => `EMA(${params.length}) ${params.source}`,
    compute: calculateEMA
  },
  rsi: {
    type: 'rsi',
    name: 'RSI',
    pane: 'separate',
    defaultParams: { length: 14, source: 'close' },
    label: (params) => `RSI(${params.length}) ${params.source}`,
    compute: calculateRSI
  },
  vwap: {
    type: 'vwap',
    name: 'Anchored VWAP',
    pane: 'overlay',
    defaultParams: { length: 1, source: 'close', anchorIso: '' },
    label: (params) => {
      const anchor = params.anchorIso ? params.anchorIso.replace('T', ' ') : 'auto';
      return `AVWAP ${anchor}`;
    },
    compute: calculateAnchoredVWAP
  },
  macd: {
    type: 'macd',
    name: 'MACD Line',
    pane: 'separate',
    defaultParams: { length: 12, source: 'close', macdFast: 12, macdSlow: 26, macdSignal: 9 },
    label: (params) => `MACD(${params.macdFast ?? 12},${params.macdSlow ?? 26},${params.macdSignal ?? 9})`,
    compute: calculateMACD
  },
  macdSignal: {
    type: 'macdSignal',
    name: 'MACD Signal',
    pane: 'separate',
    defaultParams: { length: 12, source: 'close', macdFast: 12, macdSlow: 26, macdSignal: 9 },
    label: (params) => `Signal(${params.macdFast ?? 12},${params.macdSlow ?? 26},${params.macdSignal ?? 9})`,
    compute: calculateMACDSignal
  },
  macdHistogram: {
    type: 'macdHistogram',
    name: 'MACD Histogram',
    pane: 'separate',
    defaultParams: { length: 12, source: 'close', macdFast: 12, macdSlow: 26, macdSignal: 9 },
    label: (params) => `Histogram(${params.macdFast ?? 12},${params.macdSlow ?? 26},${params.macdSignal ?? 9})`,
    compute: calculateMACDHistogram
  },
  bollingerUpper: {
    type: 'bollingerUpper',
    name: 'Bollinger Upper',
    pane: 'overlay',
    defaultParams: { length: 20, source: 'close', stdDev: 2 },
    label: (params) => `BB Upper(${params.length}, ${params.stdDev ?? 2})`,
    compute: calculateBollingerUpper
  },
  bollingerMiddle: {
    type: 'bollingerMiddle',
    name: 'Bollinger Middle',
    pane: 'overlay',
    defaultParams: { length: 20, source: 'close', stdDev: 2 },
    label: (params) => `BB Mid(${params.length})`,
    compute: calculateBollingerMiddle
  },
  bollingerLower: {
    type: 'bollingerLower',
    name: 'Bollinger Lower',
    pane: 'overlay',
    defaultParams: { length: 20, source: 'close', stdDev: 2 },
    label: (params) => `BB Lower(${params.length}, ${params.stdDev ?? 2})`,
    compute: calculateBollingerLower
  },
  volume: {
    type: 'volume',
    name: 'Volume',
    pane: 'separate',
    defaultParams: { length: 1, source: 'close' },
    label: () => 'Volume',
    compute: calculateVolume
  },
  volumeMA: {
    type: 'volumeMA',
    name: 'Volume MA',
    pane: 'separate',
    defaultParams: { length: 20, source: 'close' },
    label: (params) => `Vol MA(${params.length})`,
    compute: calculateVolumeMA
  },
  atr: {
    type: 'atr',
    name: 'ATR',
    pane: 'separate',
    defaultParams: { length: 14, source: 'close' },
    label: (params) => `ATR(${params.length})`,
    compute: calculateATR
  }
};
