import type { Candle } from '@oss-charts/core';

const DEFAULT_BASE_URL = 'https://data.alpaca.markets';
const DEFAULT_FEED = 'iex';
const RETRY_DELAYS = [500, 1000, 2000];

function getAlpacaFeed() {
  return (process.env.ALPACA_DATA_FEED || DEFAULT_FEED).toLowerCase();
}

async function fetchWithRetry(url: string, options: RequestInit): Promise<Response> {
  let lastError: Error | null = null;
  for (let i = 0; i < RETRY_DELAYS.length; i += 1) {
    try {
      const response = await fetch(url, options);
      if (response.ok) {
        return response;
      }
      if (response.status === 429 || response.status >= 500) {
        await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[i]));
        continue;
      }
      const body = await response.text();
      throw new Error(`Alpaca error ${response.status}: ${body}`);
    } catch (error) {
      lastError = error as Error;
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAYS[i]));
    }
  }
  throw lastError ?? new Error('Alpaca fetch failed');
}

export async function fetchAlpacaCandles(
  symbol: string,
  fromMs: number,
  toMs: number
): Promise<Candle[]> {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('Missing Alpaca credentials');
  }

  const baseUrl = process.env.ALPACA_BASE_URL || DEFAULT_BASE_URL;
  const candles: Candle[] = [];
  let pageToken: string | undefined;

  do {
    const url = new URL(`${baseUrl}/v2/stocks/${symbol}/bars`);
    url.searchParams.set('timeframe', '1Min');
    url.searchParams.set('start', new Date(fromMs).toISOString());
    url.searchParams.set('end', new Date(toMs).toISOString());
    url.searchParams.set('adjustment', 'raw');
    url.searchParams.set('feed', getAlpacaFeed());
    url.searchParams.set('limit', '10000');
    if (pageToken) {
      url.searchParams.set('page_token', pageToken);
    }

    const response = await fetchWithRetry(url.toString(), {
      headers: {
        'APCA-API-KEY-ID': apiKey,
        'APCA-API-SECRET-KEY': apiSecret
      }
    });

    const data = (await response.json()) as {
      bars: { t: string; o: number; h: number; l: number; c: number; v: number }[];
      next_page_token?: string | null;
    };

    for (const bar of data.bars ?? []) {
      candles.push({
        timestamp: Date.parse(bar.t),
        open: bar.o,
        high: bar.h,
        low: bar.l,
        close: bar.c,
        volume: bar.v
      });
    }

    pageToken = data.next_page_token ?? undefined;
  } while (pageToken);

  return candles.sort((a, b) => a.timestamp - b.timestamp);
}

export async function fetchAlpacaLatestTrade(symbol: string): Promise<{
  price: number;
  timestamp: number;
}> {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('Missing Alpaca credentials');
  }

  const baseUrl = process.env.ALPACA_BASE_URL || DEFAULT_BASE_URL;
  const url = new URL(`${baseUrl}/v2/stocks/${symbol}/trades/latest`);
  url.searchParams.set('feed', getAlpacaFeed());

  const response = await fetchWithRetry(url.toString(), {
    headers: {
      'APCA-API-KEY-ID': apiKey,
      'APCA-API-SECRET-KEY': apiSecret
    }
  });

  const data = (await response.json()) as {
    trade?: { t: string; p: number };
  };

  if (!data.trade) {
    throw new Error('No trade data returned');
  }

  return {
    price: data.trade.p,
    timestamp: Date.parse(data.trade.t)
  };
}
