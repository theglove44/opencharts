import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { DateTime } from 'luxon';
import type { Candle } from '@oss-charts/core';
import { NY_TZ, getNyDate } from '@oss-charts/core';

const cwd = process.cwd();
const workspaceDataDir = path.resolve(cwd, 'apps/api/data');
const DATA_DIR = fs.existsSync(workspaceDataDir)
  ? workspaceDataDir
  : path.resolve(cwd, 'data');
const DEFAULT_DB_PATH = path.join(DATA_DIR, 'cache.sqlite');

export type CandleStore = {
  getCandles: (symbol: string, fromMs: number, toMs: number) => Candle[];
  insertCandles: (symbol: string, candles: Candle[]) => void;
  invalidateToday: () => void;
};

export function createCandleStore(): CandleStore {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  const dbPath = process.env.SQLITE_PATH || DEFAULT_DB_PATH;
  const db = new Database(dbPath);

  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS candles (
      symbol TEXT NOT NULL,
      timestamp INTEGER NOT NULL,
      open REAL NOT NULL,
      high REAL NOT NULL,
      low REAL NOT NULL,
      close REAL NOT NULL,
      volume REAL NOT NULL,
      PRIMARY KEY (symbol, timestamp)
    );
    CREATE INDEX IF NOT EXISTS idx_candles_symbol_ts ON candles(symbol, timestamp);
    CREATE TABLE IF NOT EXISTS meta (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const getMeta = db.prepare('SELECT value FROM meta WHERE key = ?');
  const setMeta = db.prepare('INSERT OR REPLACE INTO meta (key, value) VALUES (?, ?)');

  const getCandlesStmt = db.prepare(
    'SELECT timestamp, open, high, low, close, volume FROM candles WHERE symbol = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC'
  );

  const insertStmt = db.prepare(
    'INSERT OR REPLACE INTO candles (symbol, timestamp, open, high, low, close, volume) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );

  function invalidateToday() {
    const today = getNyDate(Date.now());
    const last = getMeta.get('last_cache_day') as { value: string } | undefined;
    if (!last || last.value !== today) {
      const startOfDay = DateTime.fromISO(today, { zone: NY_TZ }).startOf('day').toMillis();
      db.prepare('DELETE FROM candles WHERE timestamp >= ?').run(startOfDay);
      setMeta.run('last_cache_day', today);
    }
  }

  function getCandles(symbol: string, fromMs: number, toMs: number): Candle[] {
    return getCandlesStmt.all(symbol, fromMs, toMs).map((row: any) => ({
      timestamp: row.timestamp as number,
      open: row.open as number,
      high: row.high as number,
      low: row.low as number,
      close: row.close as number,
      volume: row.volume as number
    }));
  }

  function insertCandles(symbol: string, candles: Candle[]) {
    const insertMany = db.transaction((items: Candle[]) => {
      for (const candle of items) {
        insertStmt.run(
          symbol,
          candle.timestamp,
          candle.open,
          candle.high,
          candle.low,
          candle.close,
          candle.volume
        );
      }
    });

    insertMany(candles);
  }

  return { getCandles, insertCandles, invalidateToday };
}
