import 'dotenv/config';
import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import { TIMEFRAMES } from '@oss-charts/core';
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
  origin: getCorsOrigin(),
  credentials: true
});

await server.register(rateLimit, {
  max: 100,
  timeWindow: '1 minute'
});

await server.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'", 'wss:', 'https:'],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"]
    }
  }
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

server.get('/candles', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        symbol: { type: 'string', minLength: 1, maxLength: 16 },
        tf: { type: 'string', enum: TIMEFRAMES },
        from: { type: 'string', format: 'date-time' },
        to: { type: 'string', format: 'date-time' }
      }
    }
  }
}, async (request, reply) => {
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

server.get('/latest', {
  schema: {
    querystring: {
      type: 'object',
      properties: {
        symbol: { type: 'string', minLength: 1, maxLength: 16 }
      }
    }
  }
}, async (request, reply) => {
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
const host = process.env.HOST || '127.0.0.1';

server.listen({ port, host });
