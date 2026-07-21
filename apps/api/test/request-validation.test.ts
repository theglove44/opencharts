import { describe, expect, it, vi } from 'vitest';
import {
  normalizeSymbol,
  validateCandleQuery,
  validateSymbol
} from '../src/request-validation';

describe('request validation', () => {
  it('normalizes valid stock symbols', () => {
    expect(normalizeSymbol(' spy ')).toBe('SPY');
    expect(normalizeSymbol('BRK.B')).toBe('BRK.B');
  });

  it('rejects path-like or URL-like symbols', () => {
    expect(normalizeSymbol('../SPY')).toBeNull();
    expect(normalizeSymbol('http://example.com')).toBeNull();
  });

  it('keeps mock mode on the supported symbol list', () => {
    expect(() => validateSymbol('SPY', 'mock')).not.toThrow();
    expect(() => validateSymbol('ZZZZ', 'mock')).toThrow('Unsupported symbol');
  });

  it('caps candle ranges before provider work', () => {
    vi.stubEnv('MAX_CANDLE_RANGE_DAYS', '2');

    expect(() =>
      validateCandleQuery(
        {
          symbol: 'SPY',
          tf: '1m',
          from: '2024-01-01T00:00:00.000Z',
          to: '2024-01-04T00:00:00.000Z'
        },
        'alpaca'
      )
    ).toThrow('Time range exceeds');

    vi.unstubAllEnvs();
  });
});
