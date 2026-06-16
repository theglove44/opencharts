# @oss-charts/api

Fastify API server for the OpenCharts candlestick charting platform. Fetches market data from Alpaca (live) or a mock JSON dataset, caches candles in SQLite, and serves them to the web frontend.

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `DATA_MODE` | No | `mock` | Data source: `mock` (local JSON) or `alpaca` (Alpaca Markets API). |
| `ALPACA_API_KEY` | For alpaca mode | — | Alpaca API key ID. |
| `ALPACA_API_SECRET` | For alpaca mode | — | Alpaca API secret key. |
| `ALPACA_BASE_URL` | No | `https://data.alpaca.markets` | Base URL for Alpaca REST API (e.g. `https://data.sandbox.alpaca.markets` for paper). |
| `ALPACA_DATA_FEED` | No | `iex` | Alpaca feed: `iex` (IEX SIP) or `sip` (full SIP). |
| `ALPACA_STREAM_URL` | No | `wss://stream.data.alpaca.markets/v2` | WebSocket base URL for real-time trade streaming. |
| `CORS_ORIGIN` | No | `http://localhost:5173` | Allowed CORS origin. The Vite dev server default. |
| `HOST` | No | `127.0.0.1` | Bind address. Use `0.0.0.0` for Docker/public access. |
| `PORT` | No | `3001` | HTTP listen port. |
| `SQLITE_PATH` | No | `apps/api/data/cache.sqlite` | Path to the SQLite cache database. |

## Security Defaults

| Concern | Setting |
|---|---|
| **CORS** | Strict allowlist — only `CORS_ORIGIN` (default `http://localhost:5173`) is permitted. Credentials are forwarded. |
| **Host binding** | Defaults to `127.0.0.1` — listens on loopback only, not exposed to the network. Set `HOST=0.0.0.0` explicitly for Docker or remote access. |
| **Rate limiting** | 100 requests per minute per IP via `@fastify/rate-limit`. |
| **Query schemas** | Candles and latest endpoints validate input with JSON Schema: symbol length 1–16, timeframe must be one of the known values, from/to must be ISO date-time strings. |
| **Date-range caps** | Requested time ranges are capped per timeframe: 7 days for 1m, 30 days for 5m, 60 days for 10m, 90 days for 30m, 180 days for 60m, 5 years for 1d. |
| **Helmet headers** | Content Security Policy restricts scripts/styles to `'self'` (with `unsafe-inline` for known dev scenarios), disallows framing, and scopes form actions and base URIs. |

## Running

### Mock mode (default, no credentials needed)

```bash
# From the repo root
pnpm --filter @oss-charts/api dev
```

### Alpaca mode

```bash
DATA_MODE=alpaca \
  ALPACA_API_KEY=your_key \
  ALPACA_API_SECRET=your_secret \
  pnpm --filter @oss-charts/api dev
```

Or set the variables in `apps/api/.env` (gitignored). See `.env.example` for the template.

## Endpoints

All endpoints return JSON.

| Method | Path | Query Params | Description |
|---|---|---|---|
| `GET` | `/health` | — | Health check. Returns `{ "ok": true }`. |
| `GET` | `/symbols` | — | List of supported symbols in mock mode. Returns an array of strings. |
| `GET` | `/candles` | `symbol` (default `SPY`), `tf` (default `5m`), `from` (ISO), `to` (ISO) | OHLCV candle data. Uses SQLite cache in alpaca mode. Resamples from 1m bars. |
| `GET` | `/latest` | `symbol` (default `SPY`) | Latest trade price for a symbol. Returns `{ symbol, price, timestamp }`. |

## Cache

The SQLite cache file (`cache.sqlite` + `cache.sqlite-wal`) lives in `apps/api/data/`. Both files are in `.gitignore` and are never committed. The cache is invalidated daily at server start.

## Data Mode Differences

| Aspect | Mock | Alpaca |
|---|---|---|
| Symbols | 10 fixed: SPY, QQQ, IWM, DIA, AAPL, MSFT, GOOGL, AMZN, NVDA, TSLA | Any valid Alpaca symbol |
| Candles | Transformed from a static JSON snapshot | Live API fetch + SQLite cache |
| Latest trade | Last mock candle close | REST API or WebSocket stream |
| Stream | None | WebSocket real-time trades (SPY) |
