import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { TIMEFRAMES, Timeframe } from '@oss-charts/core';
import { createCandleStore } from './db';
import { createAlpacaTradeStream } from './providers/alpaca-stream';
import { createCandleService } from './services/candles';
import { SUPPORTED_SYMBOLS } from './providers/mock';

const server = Fastify({ logger: true });

await server.register(cors, {
  origin: true
});

const candleStore = createCandleStore();
candleStore.invalidateToday();
const dataMode = (process.env.DATA_MODE || 'mock').toLowerCase();
const tradeStream =
  dataMode === 'alpaca' ? createAlpacaTradeStream(['SPY']) : null;
const candleService = createCandleService(candleStore, {
  getLatestTrade: async (symbol) => tradeStream?.getLatestTrade(symbol) ?? null
});

server.addHook('onClose', async () => {
  tradeStream?.close();
});

server.get('/health', async () => ({ ok: true }));

server.get('/symbols', async () => SUPPORTED_SYMBOLS);

type CandlesQuery = {
  symbol?: string;
  tf?: string;
  from?: string;
  to?: string;
};

function defaultLookbackMs(_: Timeframe) {
  return 90 * 24 * 60 * 60_000;
}

server.get('/candles', async (request, reply) => {
  const { symbol = 'SPY', tf = '5m', from, to } = request.query as CandlesQuery;

  // Only enforce supported symbols strict check in mock mode
  if (dataMode === 'mock' && !SUPPORTED_SYMBOLS.includes(symbol)) {
    reply.code(400);
    return { error: `Unsupported symbol in mock mode. Supported: ${SUPPORTED_SYMBOLS.join(', ')}` };
  }

  if (!TIMEFRAMES.includes(tf as Timeframe)) {
    reply.code(400);
    return { error: 'Unsupported timeframe' };
  }

  const timeframe = tf as Timeframe;
  const toMs = to ? Date.parse(to) : Date.now();
  const fromMs = from ? Date.parse(from) : toMs - defaultLookbackMs(timeframe);

  if (!Number.isFinite(fromMs) || !Number.isFinite(toMs) || fromMs >= toMs) {
    reply.code(400);
    return { error: 'Invalid time range' };
  }

  try {
    const candles = await candleService.getCandles(symbol, timeframe, fromMs, toMs);
    return {
      symbol,
      timeframe,
      candles
    };
  } catch (err) {
    // If provider fails (e.g. invalid symbol for Alpaca), return error
    reply.code(400);
    return { error: 'Failed to fetch candles. Symbol might be invalid.' };
  }
});

server.get('/latest', async (request, reply) => {
  const { symbol = 'SPY' } = request.query as CandlesQuery;

  if (dataMode === 'mock' && !SUPPORTED_SYMBOLS.includes(symbol)) {
    reply.code(400);
    return { error: `Unsupported symbol in mock mode. Supported: ${SUPPORTED_SYMBOLS.join(', ')}` };
  }

  try {
    const latest = await candleService.getLatestTrade(symbol);
    if (!latest) {
      reply.code(404);
      return { error: 'No data' };
    }

    return {
      symbol,
      price: latest.price,
      timestamp: latest.timestamp
    };
  } catch (err) {
    reply.code(400);
    return { error: 'Failed to fetch latest trade.' };
  }
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

server.listen({ port, host });
