import { fetchLatestPrice } from '$lib/api';

export interface PriceUpdate {
  price: number;
  timestamp: number;
}

type Listener = (update: PriceUpdate) => void;

const TICK_MS = 1_000;

const listeners = new Map<string, Set<Listener>>();
const inFlight = new Set<string>();
let timer: ReturnType<typeof setInterval> | null = null;

function notify(symbol: string, update: PriceUpdate) {
  for (const listener of listeners.get(symbol) ?? []) {
    listener(update);
  }
}

async function pollSymbol(symbol: string) {
  if (inFlight.has(symbol)) return;
  inFlight.add(symbol);
  try {
    const latest = await fetchLatestPrice(symbol);
    // Drop stale updates that arrived while the tab was hidden.
    if (latest && !document.hidden) notify(symbol, latest);
  } catch {
    // Transient network errors are expected; the next tick retries.
  } finally {
    inFlight.delete(symbol);
  }
}

function tick() {
  if (document.hidden) return;
  for (const symbol of listeners.keys()) {
    pollSymbol(symbol);
  }
}

/**
 * Subscribes to latest-price updates for a symbol. Multiple charts watching
 * the same symbol share a single poll request per tick.
 */
export function subscribeLatestPrice(symbol: string, listener: Listener): () => void {
  let symbolListeners = listeners.get(symbol);
  if (!symbolListeners) {
    symbolListeners = new Set();
    listeners.set(symbol, symbolListeners);
  }
  symbolListeners.add(listener);

  if (!timer) {
    timer = setInterval(tick, TICK_MS);
  }

  return () => {
    const current = listeners.get(symbol);
    current?.delete(listener);
    if (current && current.size === 0) {
      listeners.delete(symbol);
    }
    if (listeners.size === 0 && timer) {
      clearInterval(timer);
      timer = null;
    }
  };
}
