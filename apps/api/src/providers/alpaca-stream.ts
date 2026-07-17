import WebSocket from 'ws';

type LatestTrade = {
  price: number;
  timestamp: number;
};

type AlpacaTradeStream = {
  getLatestTrade: (symbol: string) => LatestTrade | null;
  close: () => void;
};

type TradeMessage = {
  T: string;
  S?: string;
  p?: number;
  t?: string;
  msg?: string;
};

const DEFAULT_STREAM_URL = 'wss://stream.data.alpaca.markets/v2';
const MAX_RECONNECT_ATTEMPTS = 10;
const MAX_BACKOFF_DELAY = 30000;

export function createAlpacaTradeStream(symbols: string[]): AlpacaTradeStream {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('Missing Alpaca credentials');
  }

  const feed = (process.env.ALPACA_DATA_FEED || 'iex').toLowerCase();
  const baseUrl = process.env.ALPACA_STREAM_URL || DEFAULT_STREAM_URL;
  const streamUrl = `${baseUrl.replace(/\/+$/, '')}/${encodeURIComponent(feed)}`;

  const latestBySymbol = new Map<string, LatestTrade>();
  let socket: WebSocket | null = null;
  let reconnectTimer: NodeJS.Timeout | null = null;
  let reconnectAttempts = 0;
  let closing = false;

  function clearReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }
  }

  function scheduleReconnect() {
    if (closing) {
      return;
    }
    clearReconnect();
    reconnectAttempts += 1;
    if (reconnectAttempts > MAX_RECONNECT_ATTEMPTS) {
      console.error(
        `Alpaca stream: max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached. Giving up.`
      );
      fatalError('Max reconnect attempts exceeded');
      return;
    }
    const baseDelay = Math.min(1000 * 2 ** reconnectAttempts, MAX_BACKOFF_DELAY);
    const jitter = Math.random() * 1000;
    const delay = baseDelay + jitter;
    reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  }

  function handleMessages(raw: string) {
    let parsed: TradeMessage | TradeMessage[];
    try {
      parsed = JSON.parse(raw) as TradeMessage | TradeMessage[];
    } catch (error) {
      console.warn('Alpaca stream message parse failed', error);
      return;
    }

    const messages = Array.isArray(parsed) ? parsed : [parsed];
    for (const message of messages) {
      if (message.T === 't' && message.S && typeof message.p === 'number' && message.t) {
        const timestamp = Date.parse(message.t);
        if (Number.isFinite(timestamp)) {
          latestBySymbol.set(message.S, { price: message.p, timestamp });
        }
      }
      if (message.T === 'error') {
        const errMsg = message.msg ?? 'unknown error';
        console.warn('Alpaca stream error', errMsg);
        if (/auth/i.test(errMsg) || /invalid.*key/i.test(errMsg) || /not.*authenticated/i.test(errMsg)) {
          fatalError(`Alpaca auth error: ${errMsg}`);
        }
      }
    }
  }

  function fatalError(reason: string) {
    closing = true;
    clearReconnect();
    if (socket) {
      socket.removeAllListeners();
      socket.close();
    }
    socket = null;
    console.error(`Alpaca stream fatal: ${reason}`);
  }

  function connect() {
    if (closing) {
      return;
    }
    clearReconnect();
    socket?.removeAllListeners();
    socket?.close();
    socket = new WebSocket(streamUrl);

    socket.on('open', () => {
      reconnectAttempts = 0;
      socket?.send(
        JSON.stringify({
          action: 'auth',
          key: apiKey,
          secret: apiSecret
        })
      );
      socket?.send(
        JSON.stringify({
          action: 'subscribe',
          trades: symbols
        })
      );
    });

    socket.on('message', (data: WebSocket.Data) => {
      const payload = typeof data === 'string' ? data : data.toString();
      handleMessages(payload);
    });

    socket.on('close', () => {
      scheduleReconnect();
    });

    socket.on('error', (error: Error) => {
      console.warn('Alpaca stream error', error);
      scheduleReconnect();
    });
  }

  connect();

  return {
    getLatestTrade: (symbol) => latestBySymbol.get(symbol) ?? null,
    close: () => {
      closing = true;
      clearReconnect();
      if (socket) {
        socket.removeAllListeners();
        socket.close();
      }
      socket = null;
    }
  };
}
