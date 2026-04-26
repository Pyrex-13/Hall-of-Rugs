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

export function seedMockData(): void {
  const db = getDb();
  const legacyMockRows = [
    ["7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU", "SAFERUG"],
    ["DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263", "ELONCAT"],
    ["EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v", "MOONDOGE"],
    ["So11111111111111111111111111111111111111112", "GRAVEYARD"],
    ["mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So", "SLOWDEATH"],
    ["4k3Dyjzvzp8eMZWUXbBCjEvwSkkk59S5iCNLY3QrkX6R", "TRUSTME"],
    ["JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN", "GHOSTCHAIN"],
    ["Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB", "DEFINOT"],
    ["HZ1JovNiVvGrGNiiYvEozEVgZ58xaU3RKwX8eACQBCt3", "YOLOCOIN"],
    ["orcaEKTdK7LKz57vaAYr9QeNsVEPfiu6QeMU1kektZE", "RUGSAFE"],
    ["AURY1snxMoS7L6dfnMzaKe3VDMSfJ3Lfk6V4P7gRb27P", "WAGMI2"],
    ["3NZ9JMVBmGAqocybic2c7LQCJScmgsAZ6vQqTDzcqmJh", "PUMP69"],
  ];

  const deleteLegacyMock = db.prepare(
    "DELETE FROM dead_tokens WHERE address = ? AND symbol = ?"
  );
  for (const [address, symbol] of legacyMockRows) {
    deleteLegacyMock.run(address, symbol);
  }

  const existing = db
    .prepare("SELECT COUNT(*) as c FROM dead_tokens")
    .get() as { c: number };
  if (existing.c > 0) return;

  const mockTokens: DeadToken[] = [
    {
      address: "HoRDead1111111111111111111111111111111111",
      symbol: "SAFERUG",
      name: "SafeRug Protocol",
      verdict: "RUGGED",
      cause: "Liquidity removed 96% within 2 hours of launch",
      oneLiner: "Dev said WAGMI. Dev meant 'I'm wagmi.'",
      bornAt: Date.now() - 6 * 60 * 60 * 1000,
      diedAt: Date.now() - 2 * 60 * 60 * 1000,
      peakMcap: 847000,
      finalMcap: 1200,
      liquidityRemovedPct: 96,
      holdersBagged: 1204,
      priceDropPct: 99.8,
      timeToDeathHours: 4,
      brutalityScore: 97,
    },
    {
      address: "HoRDead2222222222222222222222222222222222",
      symbol: "ELONCAT",
      name: "Elon's Cat Token",
      verdict: "RUGGED",
      cause: "Dev wallet dumped 100% supply after 3 hours",
      oneLiner: "Dev said WAGMI. Dev meant 'I'm wagmi.'",
      bornAt: Date.now() - 12 * 60 * 60 * 1000,
      diedAt: Date.now() - 9 * 60 * 60 * 1000,
      peakMcap: 2340000,
      finalMcap: 450,
      liquidityRemovedPct: 99,
      holdersBagged: 4521,
      priceDropPct: 99.98,
      timeToDeathHours: 3,
      brutalityScore: 99,
    },
    {
      address: "HoRDead3333333333333333333333333333333333",
      symbol: "MOONDOGE",
      name: "MoonDoge Inu",
      verdict: "FAILED LAUNCH",
      cause: "Never reached $10k MCap, volume dried within hours",
      oneLiner: "Launched into a wall.",
      bornAt: Date.now() - 24 * 60 * 60 * 1000,
      diedAt: Date.now() - 20 * 60 * 60 * 1000,
      peakMcap: 3200,
      finalMcap: 12,
      liquidityRemovedPct: 78,
      holdersBagged: 23,
      priceDropPct: 99.6,
      timeToDeathHours: 4,
      brutalityScore: 45,
    },
    {
      address: "HoRDead4444444444444444444444444444444444",
      symbol: "GRAVEYARD",
      name: "Graveyard Finance",
      verdict: "ABANDONED",
      cause: "Had $120k MCap and 340 holders but zero volume for 14 days",
      oneLiner:
        "The team pivoted to stealth mode. Very stealth. Permanently.",
      bornAt: Date.now() - 30 * 24 * 60 * 60 * 1000,
      diedAt: Date.now() - 14 * 24 * 60 * 60 * 1000,
      peakMcap: 120000,
      finalMcap: 890,
      liquidityRemovedPct: 65,
      holdersBagged: 340,
      priceDropPct: 99.2,
      timeToDeathHours: 384,
      brutalityScore: 72,
    },
    {
      address: "HoRDead5555555555555555555555555555555555",
      symbol: "SLOWDEATH",
      name: "SlowDeath Token",
      verdict: "SLOW BLEED",
      cause: "Gradual decline over 3 weeks, down 97% from peak",
      oneLiner: "Still technically alive. Technically.",
      bornAt: Date.now() - 45 * 24 * 60 * 60 * 1000,
      diedAt: Date.now() - 1 * 24 * 60 * 60 * 1000,
      peakMcap: 89000,
      finalMcap: 2670,
      liquidityRemovedPct: 43,
      holdersBagged: 187,
      priceDropPct: 97,
      timeToDeathHours: 1056,
      brutalityScore: 55,
    },
    {
      address: "HoRDead6666666666666666666666666666666666",
      symbol: "TRUSTME",
      name: "TrustMe Coin",
      verdict: "RUGGED",
      cause: "Liquidity removed 92% at peak, mint authority active",
      oneLiner: "Dev said WAGMI. Dev meant 'I'm wagmi.'",
      bornAt: Date.now() - 8 * 60 * 60 * 1000,
      diedAt: Date.now() - 5 * 60 * 60 * 1000,
      peakMcap: 560000,
      finalMcap: 340,
      liquidityRemovedPct: 92,
      holdersBagged: 892,
      priceDropPct: 99.94,
      timeToDeathHours: 3,
      brutalityScore: 95,
    },
    {
      address: "HoRDead7777777777777777777777777777777777",
      symbol: "GHOSTCHAIN",
      name: "GhostChain AI",
      verdict: "ABANDONED",
      cause: "Team disappeared after $80k MCap, no commits in 21 days",
      oneLiner:
        "The team pivoted to stealth mode. Very stealth. Permanently.",
      bornAt: Date.now() - 60 * 24 * 60 * 60 * 1000,
      diedAt: Date.now() - 21 * 24 * 60 * 60 * 1000,
      peakMcap: 80000,
      finalMcap: 1100,
      liquidityRemovedPct: 58,
      holdersBagged: 267,
      priceDropPct: 98.6,
      timeToDeathHours: 936,
      brutalityScore: 68,
    },
    {
      address: "HoRDead8888888888888888888888888888888888",
      symbol: "DEFINOT",
      name: "DefiNot a Scam",
      verdict: "RUGGED",
      cause: "LP pulled 88% in single tx, deployer funded via mixer",
      oneLiner: "Dev said WAGMI. Dev meant 'I'm wagmi.'",
      bornAt: Date.now() - 4 * 60 * 60 * 1000,
      diedAt: Date.now() - 1 * 60 * 60 * 1000,
      peakMcap: 1560000,
      finalMcap: 2800,
      liquidityRemovedPct: 88,
      holdersBagged: 3102,
      priceDropPct: 99.82,
      timeToDeathHours: 3,
      brutalityScore: 96,
    },
    {
      address: "HoRDead9999999999999999999999999999999999",
      symbol: "YOLOCOIN",
      name: "YOLO Finance",
      verdict: "FAILED LAUNCH",
      cause: "Max 18 holders, MCap never exceeded $2k",
      oneLiner: "Launched into a wall.",
      bornAt: Date.now() - 48 * 60 * 60 * 1000,
      diedAt: Date.now() - 44 * 60 * 60 * 1000,
      peakMcap: 1800,
      finalMcap: 0,
      liquidityRemovedPct: 100,
      holdersBagged: 18,
      priceDropPct: 100,
      timeToDeathHours: 4,
      brutalityScore: 40,
    },
    {
      address: "HoRDeadAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      symbol: "RUGSAFE",
      name: "RugSafe Insurance",
      verdict: "RUGGED",
      cause: "The irony writes itself. LP drained 94% at $1.2M MCap.",
      oneLiner: "Dev said WAGMI. Dev meant 'I'm wagmi.'",
      bornAt: Date.now() - 10 * 60 * 60 * 1000,
      diedAt: Date.now() - 7 * 60 * 60 * 1000,
      peakMcap: 1200000,
      finalMcap: 560,
      liquidityRemovedPct: 94,
      holdersBagged: 2847,
      priceDropPct: 99.95,
      timeToDeathHours: 3,
      brutalityScore: 98,
    },
    {
      address: "HoRDeadBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB",
      symbol: "WAGMI2",
      name: "WAGMI 2.0",
      verdict: "SLOW BLEED",
      cause: "Declining steadily over 18 days, down 96% from ATH",
      oneLiner: "Still technically alive. Technically.",
      bornAt: Date.now() - 25 * 24 * 60 * 60 * 1000,
      diedAt: Date.now() - 2 * 24 * 60 * 60 * 1000,
      peakMcap: 45000,
      finalMcap: 1800,
      liquidityRemovedPct: 35,
      holdersBagged: 156,
      priceDropPct: 96,
      timeToDeathHours: 552,
      brutalityScore: 52,
    },
    {
      address: "HoRDeadCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
      symbol: "PUMP69",
      name: "PumpAndDump69",
      verdict: "RUGGED",
      cause: "Classic pump & dump. LP removed 91% at peak. 6,200 holders rugged.",
      oneLiner: "Dev said WAGMI. Dev meant 'I'm wagmi.'",
      bornAt: Date.now() - 3 * 60 * 60 * 1000,
      diedAt: Date.now() - 30 * 60 * 1000,
      peakMcap: 3400000,
      finalMcap: 890,
      liquidityRemovedPct: 91,
      holdersBagged: 6200,
      priceDropPct: 99.97,
      timeToDeathHours: 2.5,
      brutalityScore: 100,
    },
  ];

  for (const token of mockTokens) {
    upsertDeadToken(token);
  }
}
