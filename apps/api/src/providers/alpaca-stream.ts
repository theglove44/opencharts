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
const RECONNECT_DELAYS_MS = [1000, 2000, 5000, 10000];

export function createAlpacaTradeStream(symbols: string[]): AlpacaTradeStream {
  const apiKey = process.env.ALPACA_API_KEY;
  const apiSecret = process.env.ALPACA_API_SECRET;
  if (!apiKey || !apiSecret) {
    throw new Error('Missing Alpaca credentials');
  }

  const feed = (process.env.ALPACA_DATA_FEED || 'iex').toLowerCase();
  const baseUrl = process.env.ALPACA_STREAM_URL || DEFAULT_STREAM_URL;
  const streamUrl = `${baseUrl}/${feed}`;

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
    const delay =
      RECONNECT_DELAYS_MS[Math.min(reconnectAttempts, RECONNECT_DELAYS_MS.length - 1)];
    reconnectAttempts += 1;
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
        console.warn('Alpaca stream error', message.msg ?? 'unknown error');
      }
    }
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
