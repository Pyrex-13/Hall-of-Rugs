import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import type { DeadToken, DeadTokenRow, ApiCacheRow } from "./types";

function getDbPath(): string {
  const dataDir = path.join(process.cwd(), ".data");
  try {
    fs.mkdirSync(dataDir, { recursive: true });
    const testFile = path.join(dataDir, ".write-test");
    fs.writeFileSync(testFile, "");
    fs.unlinkSync(testFile);
    return path.join(dataDir, "hall-of-rugs.sqlite");
  } catch {
    return path.join("/tmp", "hall-of-rugs.sqlite");
  }
}

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  const dbPath = getDbPath();
  _db = new Database(dbPath);
  _db.pragma("journal_mode = WAL");
  _db.exec(`
    CREATE TABLE IF NOT EXISTS api_cache (
      key TEXT PRIMARY KEY,
      endpoint TEXT NOT NULL,
      token_address TEXT NOT NULL DEFAULT '',
      response_json TEXT NOT NULL,
      status_code INTEGER NOT NULL DEFAULT 200,
      fetched_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS dead_tokens (
      address TEXT PRIMARY KEY,
      symbol TEXT NOT NULL DEFAULT '',
      name TEXT NOT NULL DEFAULT '',
      verdict TEXT NOT NULL DEFAULT '',
      cause TEXT NOT NULL DEFAULT '',
      one_liner TEXT NOT NULL DEFAULT '',
      born_at INTEGER NOT NULL DEFAULT 0,
      died_at INTEGER NOT NULL DEFAULT 0,
      peak_mcap REAL NOT NULL DEFAULT 0,
      final_mcap REAL NOT NULL DEFAULT 0,
      liquidity_removed_pct REAL NOT NULL DEFAULT 0,
      holders_bagged INTEGER NOT NULL DEFAULT 0,
      price_drop_pct REAL NOT NULL DEFAULT 0,
      time_to_death_hours REAL NOT NULL DEFAULT 0,
      brutality_score REAL NOT NULL DEFAULT 0,
      logo_uri TEXT NOT NULL DEFAULT '',
      raw_json TEXT NOT NULL DEFAULT '{}',
      updated_at INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_cache_fetched ON api_cache(endpoint, token_address, fetched_at);
    CREATE INDEX IF NOT EXISTS idx_dead_verdict ON dead_tokens(verdict);
    CREATE INDEX IF NOT EXISTS idx_dead_updated ON dead_tokens(updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_dead_brutality ON dead_tokens(brutality_score DESC);
  `);
  return _db;
}

export function getCachedResponse(
  endpoint: string,
  tokenAddress: string,
  params: string = ""
): ApiCacheRow | undefined {
  const db = getDb();
  const key = `${endpoint}:${tokenAddress}:${params}`;
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  return db
    .prepare(
      "SELECT * FROM api_cache WHERE key = ? AND fetched_at > ?"
    )
    .get(key, fiveMinAgo) as ApiCacheRow | undefined;
}

export function setCachedResponse(
  endpoint: string,
  tokenAddress: string,
  params: string = "",
  responseJson: string,
  statusCode: number
): void {
  const db = getDb();
  const key = `${endpoint}:${tokenAddress}:${params}`;
  db.prepare(
    `INSERT OR REPLACE INTO api_cache (key, endpoint, token_address, response_json, status_code, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(key, endpoint, tokenAddress, responseJson, statusCode, Date.now());
}

export function upsertDeadToken(token: DeadToken): void {
  const db = getDb();
  db.prepare(
    `INSERT OR REPLACE INTO dead_tokens
     (address, symbol, name, verdict, cause, one_liner, born_at, died_at,
      peak_mcap, final_mcap, liquidity_removed_pct, holders_bagged,
      price_drop_pct, time_to_death_hours, brutality_score, logo_uri, raw_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    token.address,
    token.symbol,
    token.name,
    token.verdict,
    token.cause,
    token.oneLiner,
    token.bornAt,
    token.diedAt,
    token.peakMcap,
    token.finalMcap,
    token.liquidityRemovedPct,
    token.holdersBagged,
    token.priceDropPct,
    token.timeToDeathHours,
    token.brutalityScore,
    token.logoUri ?? "",
    JSON.stringify(token),
    Date.now()
  );
}

export function getDeadTokens(
  filter?: string,
  sort?: string,
  limit: number = 50
): DeadToken[] {
  const db = getDb();
  let where = "1=1";
  if (filter && filter !== "ALL DEAD") {
    where = "verdict = ?";
  }
  let orderBy = "updated_at DESC";
  switch (sort) {
    case "Biggest MCap Lost":
      orderBy = "peak_mcap DESC";
      break;
    case "Most Holders Bagged":
      orderBy = "holders_bagged DESC";
      break;
    case "Most Brutal":
      orderBy = "brutality_score DESC";
      break;
    default:
      orderBy = "died_at DESC, updated_at DESC";
  }
  const query = `SELECT * FROM dead_tokens WHERE ${where} ORDER BY ${orderBy} LIMIT ?`;
  const params =
    filter && filter !== "ALL DEAD" ? [filter, limit] : [limit];
  const rows = db.prepare(query).all(...params) as DeadTokenRow[];
  return rows.map(rowToDeadToken);
}

export function getDeadTokenByAddress(
  address: string
): DeadToken | undefined {
  const db = getDb();
  const row = db
    .prepare("SELECT * FROM dead_tokens WHERE address = ?")
    .get(address) as DeadTokenRow | undefined;
  return row ? rowToDeadToken(row) : undefined;
}

export function getTodayStats(): {
  count: number;
  liquidityRemoved: number;
  holdersBagged: number;
  biggestRugName: string;
  biggestRugMcap: number;
} {
  const db = getDb();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const ts = todayStart.getTime();

  const countRow = db
    .prepare(
      "SELECT COUNT(*) as c FROM dead_tokens WHERE died_at >= ? OR updated_at >= ?"
    )
    .get(ts, ts) as { c: number };

  const statsRow = db
    .prepare(
      `SELECT
        COALESCE(SUM(peak_mcap * liquidity_removed_pct / 100), 0) as liq,
        COALESCE(SUM(holders_bagged), 0) as holders
       FROM dead_tokens WHERE died_at >= ? OR updated_at >= ?`
    )
    .get(ts, ts) as { liq: number; holders: number };

  const biggestRow = db
    .prepare(
      `SELECT symbol, name, peak_mcap FROM dead_tokens
       WHERE (died_at >= ? OR updated_at >= ?) AND verdict = 'RUGGED'
       ORDER BY peak_mcap DESC LIMIT 1`
    )
    .get(ts, ts) as
    | { symbol: string; name: string; peak_mcap: number }
    | undefined;

  return {
    count: countRow.c,
    liquidityRemoved: Math.round(statsRow.liq),
    holdersBagged: statsRow.holders,
    biggestRugName: biggestRow ? `$${biggestRow.symbol}` : "N/A",
    biggestRugMcap: biggestRow?.peak_mcap ?? 0,
  };
}

function rowToDeadToken(row: DeadTokenRow): DeadToken {
  return {
    address: row.address,
    symbol: row.symbol,
    name: row.name,
    verdict: row.verdict as DeadToken["verdict"],
    cause: row.cause,
    oneLiner: row.one_liner,
    bornAt: row.born_at,
    diedAt: row.died_at,
    peakMcap: row.peak_mcap,
    finalMcap: row.final_mcap,
    liquidityRemovedPct: row.liquidity_removed_pct,
    holdersBagged: row.holders_bagged,
    priceDropPct: row.price_drop_pct,
    timeToDeathHours: row.time_to_death_hours,
    brutalityScore: row.brutality_score,
    logoUri: row.logo_uri || undefined,
  };
}

export function purgeDemoData(): void {
  const db = getDb();
  db.prepare(
    `DELETE FROM dead_tokens WHERE address LIKE 'HoRDead%'`
  ).run();
}
