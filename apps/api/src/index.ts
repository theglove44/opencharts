import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import { createCandleStore } from './db';
import { createAlpacaTradeStream } from './providers/alpaca-stream';
import { createCandleService } from './services/candles';
import { SUPPORTED_SYMBOLS } from './providers/mock';
import {
  type CandlesQuery,
  normalizeDataMode,
  validateCandleQuery,
  validateSymbol
} from './request-validation';

const server = Fastify({ logger: true });

function getCorsOrigin() {
  const configured = process.env.API_CORS_ORIGIN || process.env.CORS_ORIGIN;
  if (!configured) {
    return process.env.NODE_ENV === 'production' ? false : true;
  }
  if (configured === '*') {
    return true;
  }
  return configured
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);
}

await server.register(cors, {
  origin: getCorsOrigin()
});

const candleStore = createCandleStore();
candleStore.invalidateToday();
const dataMode = normalizeDataMode();
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

server.get('/candles', async (request, reply) => {
  let validated;
  try {
    validated = validateCandleQuery(request.query as CandlesQuery, dataMode);
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : 'Invalid candle query' };
  }

  try {
    const { symbol, timeframe, fromMs, toMs } = validated;
    const candles = await candleService.getCandles(symbol, timeframe, fromMs, toMs);
    return {
      symbol,
      timeframe,
      candles
    };
  } catch {
    // If provider fails (e.g. invalid symbol for Alpaca), return error
    reply.code(400);
    return { error: 'Failed to fetch candles. Symbol might be invalid.' };
  }
});

server.get('/latest', async (request, reply) => {
  let symbol: string;
  try {
    symbol = validateSymbol((request.query as CandlesQuery).symbol, dataMode);
  } catch (error) {
    reply.code(400);
    return { error: error instanceof Error ? error.message : 'Invalid symbol' };
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
  } catch {
    reply.code(400);
    return { error: 'Failed to fetch latest trade.' };
  }
});

const port = Number(process.env.PORT || 3001);
const host = process.env.HOST || '0.0.0.0';

server.listen({ port, host });
