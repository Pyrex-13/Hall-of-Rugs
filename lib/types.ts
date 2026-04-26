export interface DeadToken {
  address: string;
  symbol: string;
  name: string;
  verdict: Verdict;
  cause: string;
  oneLiner: string;
  bornAt: number;
  diedAt: number;
  peakMcap: number;
  finalMcap: number;
  liquidityRemovedPct: number;
  holdersBagged: number;
  priceDropPct: number;
  timeToDeathHours: number;
  brutalityScore: number;
  logoUri?: string;
}

export type Verdict =
  | "RUGGED"
  | "FAILED LAUNCH"
  | "ABANDONED"
  | "SLOW BLEED"
  | "STILL ALIVE";

export type FilterType =
  | "ALL DEAD"
  | "RUGGED"
  | "FAILED LAUNCH"
  | "ABANDONED"
  | "SLOW BLEED";

export type SortType =
  | "Most Recent"
  | "Biggest MCap Lost"
  | "Most Holders Bagged"
  | "Most Brutal";

export interface AutopsyResult {
  token: DeadToken;
  priceHistory: OHLCVPoint[];
  securityFlags: SecurityFlag[];
  topHoldersPct: number;
  currentPrice: number;
  currentLiquidity: number;
  peakLiquidity: number;
}

export interface OHLCVPoint {
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface SecurityFlag {
  label: string;
  danger: boolean;
  detail: string;
}

export interface DayStats {
  tokensDiedToday: number;
  totalLiquidityRemoved: number;
  totalHoldersBagged: number;
  biggestRugName: string;
  biggestRugMcap: number;
}

export interface BirdeyeTokenOverview {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  logoURI?: string;
  liquidity: number;
  mc: number;
  v24hUSD: number;
  v24hChangePercent: number;
  holder: number;
  price: number;
  history30mPrice?: number;
  history1hPrice?: number;
  history2hPrice?: number;
  history4hPrice?: number;
  history6hPrice?: number;
  history8hPrice?: number;
  history12hPrice?: number;
  history24hPrice: number;
  priceChange24hPercent: number;
  supply: number;
  realMc?: number;
  lastTradeUnixTime?: number;
  createdAt?: number;
  extensions?: Record<string, string>;
}

export interface BirdeyeTokenSecurity {
  ownerAddress?: string | null;
  creatorAddress?: string | null;
  metaplexUpdateAuthority?: string | null;
  ownerPercentage?: number | null;
  creatorPercentage?: number | null;
  isToken2022: boolean;
  isTrueToken: boolean;
  totalSupply: number;
  mutableMetadata: boolean | null;
  top10HolderPercent: number | null;
  top10HolderBalance?: number | null;
  top10UserPercent?: number;
  freezeable?: boolean | null;
  freezeAuthority?: string | null;
  mintAuthority?: string | null;
  isHoneypot?: boolean;
  transferFeeEnable?: boolean;
  nonTransferable?: boolean;
  lockInfo?: unknown;
  preMarketHolder?: Array<{ address: string; amount: number; pct: number }>;
}

export interface BirdeyeOHLCV {
  items: Array<{
    unixTime: number;
    o: number;
    h: number;
    l: number;
    c: number;
    v: number;
  }>;
}

export interface BirdeyeNewListing {
  items: Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
    liquidity: number;
    mc: number;
    v24hUSD: number;
    holder: number;
    openTimestamp?: number;
  }>;
}

export interface BirdeyeTrending {
  items: Array<{
    address: string;
    symbol: string;
    name: string;
    decimals: number;
    logoURI?: string;
    price: number;
    v24hUSD: number;
    v24hChangePercent: number;
    mc: number;
    holder: number;
    liquidity: number;
    rank: number;
  }>;
}

export interface ApiCacheRow {
  key: string;
  endpoint: string;
  token_address: string;
  response_json: string;
  status_code: number;
  fetched_at: number;
}

export interface DeadTokenRow {
  address: string;
  symbol: string;
  name: string;
  verdict: string;
  cause: string;
  one_liner: string;
  born_at: number;
  died_at: number;
  peak_mcap: number;
  final_mcap: number;
  liquidity_removed_pct: number;
  holders_bagged: number;
  price_drop_pct: number;
  time_to_death_hours: number;
  brutality_score: number;
  logo_uri: string;
  raw_json: string;
  updated_at: number;
}
